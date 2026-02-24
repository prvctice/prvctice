{
  "targets": [{
    "target_name": "speech_recognizer",
    "sources": ["src/speech_recognizer.mm"],
    # Include node-addon-api gyp fragment to enable C++ exceptions support
    "includes": [ "node_modules/node-addon-api/except.gypi" ],
    # Include the C++ headers for node-addon-api (no extra quoting)
    "include_dirs": [
      "<!(node -p \"require('node-addon-api').include_dir\")"
    ],
    # Pull in the node-addon-api gyp fragment for linkage
    "dependencies": [
      "<!(node -p \"require('node-addon-api').gyp\")"
    ],
    # C++ flags (applying to .cc/.cpp) and Objective-C++ flags below
    # Define to enable C++ exception support in node-addon-api
    "defines": [ "NAPI_CPP_EXCEPTIONS" ],
    # Remove default no-exceptions and no-rtti flags
    "cflags_cc!": [ "-fno-exceptions", "-fno-rtti" ],
    # C++ compilation flags: set C++17 and re-enable exceptions, RTTI
    "cflags_cc": [ "-std=c++17", "-fexceptions", "-frtti" ],
    # Objective-C++ compilation flags (.mm): enable ARC
    "objcflags_cc": [ "-fobjc-arc" ],
    "xcode_settings": {
      "OTHER_LDFLAGS": ["-framework", "Speech", "-framework", "AVFoundation"]
    }
  }]
}