#include <napi.h>
#import <Speech/Speech.h>
#import <AVFoundation/AVFoundation.h>
#import <dispatch/dispatch.h>

using namespace Napi;

// =============================================================
// Simple macOS Speech-to-Text bridge for Electron
// -------------------------------------------------------------
// This native addon exposes three asynchronous functions:
//   • requestAuthorization() – promise → "authorized" | "denied"
//   • start(cb)               – begin live recognition, invoke
//                               the JS callback with (text,
//                               isFinal) for every partial/
//                               final result.
//   • stop()                  – stop recognition & release
//                               resources.
//
// The addon records audio directly using AVAudioEngine, therefore
// no audio data needs to be piped from the renderer.
//
// NOTE:  This is **intentionally minimal** – enough for the app to
//        bypass Chromium’s WebSpeech API when running inside the
//        Electron shell.  It is not a full-featured wrapper.
// =============================================================

static SFSpeechRecognizer *recognizer = nil;
static SFSpeechAudioBufferRecognitionRequest *request = nil;
static SFSpeechRecognitionTask *task = nil;
static AVAudioEngine *engine = nil;

// Thread-safe JS callback used to forward transcripts.
static ThreadSafeFunction tsfn;

// ---------------------------------------------------------------------------
// Helper to gracefully tear-down any existing session
// ---------------------------------------------------------------------------
static void CleanupSession() {
  if (task) {
    [task cancel];
    task = nil;
  }

  if (engine) {
    if (engine.isRunning) {
      [engine stop];
    }
    engine = nil;
  }

  request = nil;
}

// ---------------------------------------------------------------------------
// requestAuthorization() – returns a JS promise
// ---------------------------------------------------------------------------
// Check current authorization status synchronously and request if needed
Value RequestAuth(const CallbackInfo &info) {
  Env env = info.Env();

  // Get current authorization status
  SFSpeechRecognizerAuthorizationStatus status = [SFSpeechRecognizer authorizationStatus];
  NSLog(@"[speech] Current authorization status: %ld", (long)status);

  // If not determined, trigger the authorization request (async, but we return current status)
  if (status == SFSpeechRecognizerAuthorizationStatusNotDetermined) {
    NSLog(@"[speech] Status is notDetermined, triggering authorization request...");
    // Fire-and-forget the authorization request to trigger the system prompt
    [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus newStatus) {
      // This callback may not integrate with Node's event loop,
      // but we don't need it - the user will grant permission and it will
      // be available on next check or when start() is called.
      NSLog(@"[speech] Authorization callback received: %ld", (long)newStatus);
    }];
    // Return notDetermined for now - the JS code will handle retry or proceed
    return String::New(env, "notDetermined");
  }

  // Return current status
  const char *cstr;
  switch (status) {
    case SFSpeechRecognizerAuthorizationStatusAuthorized:
      cstr = "authorized";
      NSLog(@"[speech] Authorization status: authorized");
      break;
    case SFSpeechRecognizerAuthorizationStatusDenied:
      cstr = "denied";
      NSLog(@"[speech] Authorization status: denied");
      break;
    case SFSpeechRecognizerAuthorizationStatusRestricted:
      cstr = "restricted";
      NSLog(@"[speech] Authorization status: restricted");
      break;
    default:
      cstr = "notDetermined";
      NSLog(@"[speech] Authorization status: notDetermined (default)");
      break;
  }
  return String::New(env, cstr);
}

// ---------------------------------------------------------------------------
// Internal C++ → JS trampoline for transcript events
// ---------------------------------------------------------------------------
static void EmitTranscript(const std::string &text, bool isFinal) {
  if (!tsfn) return;

  struct Payload {
    std::string text;
    bool isFinal;
  } *data = new Payload{ text, isFinal };

  auto callback = [](Napi::Env env, Napi::Function jsCallback, Payload *payload) {
    jsCallback.Call({ String::New(env, payload->text), Napi::Boolean::New(env, payload->isFinal) });
    delete payload;
  };

  napi_status status = tsfn.BlockingCall(data, callback);
  if (status != napi_ok) {
    // If the JS side went away we silently drop events to avoid
    // crashing the process.
  }
}

// ---------------------------------------------------------------------------
// start(callback) – begin live recognition
// ---------------------------------------------------------------------------
Value StartRecognition(const CallbackInfo &info) {
  Env env = info.Env();
  NSLog(@"[speech] StartRecognition called");

  if (info.Length() == 0 || !info[0].IsFunction()) {
    TypeError::New(env, "First argument must be a function").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Check authorization status before starting
  SFSpeechRecognizerAuthorizationStatus authStatus = [SFSpeechRecognizer authorizationStatus];
  NSLog(@"[speech] Authorization status at start: %ld", (long)authStatus);

  if (authStatus != SFSpeechRecognizerAuthorizationStatusAuthorized) {
    NSLog(@"[speech] WARNING: Speech recognition not authorized (status=%ld)", (long)authStatus);
    // Continue anyway - macOS may prompt the user, or recognition will fail with an error
  }

  Function jsCallback = info[0].As<Function>();

  // Clean up any previous recognition session
  CleanupSession();

  // Create a new thread-safe function for this session
  tsfn = ThreadSafeFunction::New(env,
                                jsCallback,
                                "NativeSpeechCallback",
                                0,     // unlimited queue
                                1);    // single native thread

  recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:@"en-US"]];
  if (!recognizer) {
    NSLog(@"[speech] ERROR: Failed to create SFSpeechRecognizer");
    Error::New(env, "Failed to create SFSpeechRecognizer").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Check if recognizer is available
  if (!recognizer.isAvailable) {
    NSLog(@"[speech] ERROR: SFSpeechRecognizer is not available");
    Error::New(env, "Speech recognizer is not available. Check network connection and speech recognition permissions.").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  NSLog(@"[speech] SFSpeechRecognizer created and available");

  request = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
  request.shouldReportPartialResults = YES;

  engine = [[AVAudioEngine alloc] init];
  AVAudioInputNode *inputNode = engine.inputNode;
  AVAudioFormat *format = [inputNode outputFormatForBus:0];

  // Tap the microphone input and feed buffers into the recognition request
  [inputNode removeTapOnBus:0];
  [inputNode installTapOnBus:0
                    bufferSize:1024
                        format:format
                         block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
    if (request) {
      [request appendAudioPCMBuffer:buffer];
    }
  }];

  // Start the audio engine (no AVAudioSession configuration on macOS)
  NSError *nsError = nil;
  [engine prepare];
  if (![engine startAndReturnError:&nsError]) {
    NSString *errMsg = nsError ? [nsError localizedDescription] : @"Unknown error";
    std::string errStr("Failed to start AVAudioEngine: ");
    errStr += [errMsg UTF8String];
    Error::New(env, errStr).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  NSLog(@"[speech] AVAudioEngine started successfully");

  // Start the recognition task
  NSLog(@"[speech] Starting recognition task...");
  task = [recognizer recognitionTaskWithRequest:request
                                  resultHandler:^(SFSpeechRecognitionResult * _Nullable result,
                                                  NSError * _Nullable error) {
    if (error) {
      NSLog(@"[speech] Recognition error: %@ (code=%ld, domain=%@)",
            [error localizedDescription],
            (long)[error code],
            [error domain]);
      // Don't emit errors as transcripts - log them instead
      // The JS side will handle timeouts and retry logic
      return;
    }

    if (!result) {
      NSLog(@"[speech] Recognition result is nil (no error)");
      return;
    }

    NSString *best = result.bestTranscription.formattedString;
    std::string text([best UTF8String]);
    NSLog(@"[speech] Transcript: '%s' (isFinal=%d)", text.c_str(), result.isFinal);

    EmitTranscript(text, result.isFinal);
  }];

  if (!task) {
    NSLog(@"[speech] ERROR: Failed to create recognition task");
  } else {
    NSLog(@"[speech] Recognition task created successfully");
  }

  return env.Undefined();
}

// ---------------------------------------------------------------------------
// stop() – end the current session
// ---------------------------------------------------------------------------
Value StopRecognition(const CallbackInfo &info) {
  CleanupSession();
  if (tsfn) {
    tsfn.Release();
    tsfn = nullptr;
  }
  return info.Env().Undefined();
}

// ---------------------------------------------------------------------------
// Dummy feedAudio() kept for backwards-compatibility (no-op).
// ---------------------------------------------------------------------------
Value FeedAudio(const CallbackInfo &info) { return info.Env().Undefined(); }

// ---------------------------------------------------------------------------
// Module initialisation
// ---------------------------------------------------------------------------
Object Init(Env env, Object exports) {
  exports.Set("requestAuthorization", Function::New(env, RequestAuth));
  exports.Set("start", Function::New(env, StartRecognition));
  exports.Set("stop", Function::New(env, StopRecognition));
  exports.Set("feedAudio", Function::New(env, FeedAudio));
  return exports;
}

NODE_API_MODULE(speech_recognizer, Init)
