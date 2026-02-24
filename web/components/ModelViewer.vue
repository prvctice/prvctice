<template>
  <!-- Logic-only island: uses existing DOM (#model-container, #toggle-model-button) -->
  <div style="display: contents"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { makeMagnetic } from '@web/utils/magnet.js';
import { useIntentCoordinator } from '@web/composables/useIntentCoordinator.js';
import { storage } from '@web/storage/storage.js';
import { STORAGE_KEYS } from '@web/constants/storageKeys.js';
import { useEventBus } from '@web/services/eventBus';

let cleanupFns = [];

onMounted(() => {
  try {
    const toggleBtn = document.getElementById('toggle-model-button');
    const container = document.getElementById('model-container');
    if (!toggleBtn || !container) return;

    let THREE, GLTFLoader, MeshoptDecoder, DRACOLoader;
    let threeImportPromise = null;
    let scene, camera, renderer, model, mixer;
    let animationFrameId = null;
    let clock = null;
    let loadCurrentModel = null;

    // Animation categories
    let idleAction = null; // Default looping idle
    let ambientActions = []; // Subtle life animations (periodic)
    let tapActions = []; // Triggered on click
    let ambientTimerId = null;
    let currentCharKey = 'animebird';

    // Per-character config: display tuning + explicit animation roles
    // lookAtY is tuned so feet (y=0) sit at the canvas bottom edge
    // Formula: lookAtY ≈ tan(fov/2) * cameraZ  (with fov=40, tan(20°)≈0.36)
    const CHARACTER_CONFIG = {
      animebird: {
        scale: 0.6,
        cameraY: 1.3,
        cameraZ: 3.5,
        lookAtY: 1.24,
        rotation: Math.PI / 12,
        height: 300,
        ambientMinMs: 30000,
        ambientRangeMs: 30000, // 30–60s
        // Meshy names scrambled — visual mapping:
        // Idle_11=look around dumbfounded, bicep_curl=long breathe,
        // Look_Around_Dumbfounded=walking, Long_Breathe=running,
        // Running=idle11(?), Walking=bicep curl(?)
        idle: ['Walking'],
        ambient: ['Idle_11', 'bicep_curl'],
        tap: ['Running', 'Idle_11', 'bicep_curl'],
      },
      dog: {
        // Split GLB files — each has one properly-named animation
        // Clip names: Armature|<name>|baselayer
        scale: 0.67,
        cameraY: 1.2,
        cameraZ: 3.0,
        lookAtY: 1.052,
        rotation: Math.PI / 12,
        height: 340,
        ambientMinMs: 150000,
        ambientRangeMs: 90000, // 2.5–4min
        idle: ['Armature|Idle_11|baselayer'],
        ambient: ['Armature|Idle_03|baselayer'],
        tap: [
          'Armature|Look_Around_Dumbfounded|baselayer',
          'Armature|Hip_Hop_Dance_1|baselayer',
          'Armature|Backflip|baselayer',
          'Armature|air_squat|baselayer',
        ],
      },
      tree: {
        scale: 0.8,
        cameraY: 1.3,
        cameraZ: 3.5,
        lookAtY: 1.34,
        rotation: Math.PI / 12,
        height: 300,
        ambientMinMs: 30000,
        ambientRangeMs: 30000,
        // Meshy names scrambled — visual mapping:
        // Hip_Hop_Dance=big wave, Walking=running,
        // Big_Wave_Hello=bass beats, Bass_Beats=walking
        idle: ['Idle'],
        ambient: ['Big_Wave_Hello', 'Hip_Hop_Dance'],
        tap: [],
      },
    };

    function getCharacterKey(path) {
      if (path.includes('dog')) return 'dog';
      if (path.includes('tree')) return 'tree';
      return 'animebird';
    }

    function classifyAnimations(clips, charKey) {
      idleAction = null;
      ambientActions = [];
      tapActions = [];

      const cfg = CHARACTER_CONFIG[charKey] || CHARACTER_CONFIG.animebird;
      const idleSet = new Set(cfg.idle);
      const ambientSet = new Set(cfg.ambient);
      const tapSet = new Set(cfg.tap);

      for (const clip of clips) {
        const name = clip.name;

        if (idleSet.has(name) && !idleAction) {
          const action = mixer.clipAction(clip);
          action.loop = THREE.LoopRepeat;
          action.clampWhenFinished = false;
          idleAction = action;
        } else if (ambientSet.has(name)) {
          const action = mixer.clipAction(clip);
          action.loop = THREE.LoopOnce;
          action.clampWhenFinished = true;
          ambientActions.push(action);
        } else if (tapSet.has(name)) {
          const action = mixer.clipAction(clip);
          action.loop = THREE.LoopOnce;
          action.clampWhenFinished = true;
          tapActions.push(action);
        }
      }
    }

    function startIdleLoop() {
      if (idleAction) {
        idleAction.reset().play();
      }
    }

    function playRandomAmbient() {
      if (!ambientActions.length || !mixer) return;
      mixer.stopAllAction();
      const action = ambientActions[Math.floor(Math.random() * ambientActions.length)];
      action.reset().play();
      mixer.addEventListener('finished', function onFinished(e) {
        if (e.action === action) {
          mixer.removeEventListener('finished', onFinished);
          if (idleAction) idleAction.reset().play();
        }
      });
    }

    function scheduleAmbient() {
      clearAmbientTimer();
      const cfg = CHARACTER_CONFIG[currentCharKey] || CHARACTER_CONFIG.animebird;
      const delay = (cfg.ambientMinMs || 150000) + Math.random() * (cfg.ambientRangeMs || 90000);
      ambientTimerId = setTimeout(() => {
        if (
          mixer &&
          !container.classList.contains('hidden') &&
          !container.classList.contains('panel-hidden')
        ) {
          playRandomAmbient();
        }
        scheduleAmbient();
      }, delay);
    }

    function clearAmbientTimer() {
      if (ambientTimerId !== null) {
        clearTimeout(ambientTimerId);
        ambientTimerId = null;
      }
    }

    function playRandomTap() {
      const pool = tapActions.length ? tapActions : ambientActions;
      if (!pool.length || !mixer) return;
      // Reset ambient timer — tapping counts as activity
      scheduleAmbient();
      // Stop any currently playing non-idle action
      mixer.stopAllAction();
      const action = pool[Math.floor(Math.random() * pool.length)];
      action.reset().play();
      mixer.addEventListener('finished', function onFinished(e) {
        if (e.action === action) {
          mixer.removeEventListener('finished', onFinished);
          // Return to idle
          if (idleAction) idleAction.reset().play();
        }
      });
    }
    const CHARACTER_PATHS = {
      animebird: 'model/Animebird/animebird_opt.glb',
      dog: 'model/dog/dog_base.glb',
      tree: 'model/tree/tree_opt.glb',
    };

    // Characters with separate animation files (one anim per GLB)
    const CHARACTER_EXTRA_ANIMS = {
      dog: [
        'model/dog/dog_anim_Idle_03.glb',
        'model/dog/dog_anim_Hip_Hop_Dance_1.glb',
        'model/dog/dog_anim_Look_Around_Dumbfounded.glb',
        'model/dog/dog_anim_Backflip.glb',
        'model/dog/dog_anim_air_squat.glb',
      ],
    };

    function getModelPath() {
      const stored = storage.mirror.get(STORAGE_KEYS.CHARACTER_MODEL);
      const key = stored && stored in CHARACTER_PATHS ? stored : 'animebird';
      return import.meta.env.BASE_URL + CHARACTER_PATHS[key];
    }

    let MODEL_PATH = getModelPath();

    const bar = document.getElementById('bar');
    let isAttachedToBar = false;
    let attachOffsetY = 0;

    function getCurrentPosition() {
      const rect = container.getBoundingClientRect();
      const docEl = document.documentElement;
      const left = rect.left + window.pageXOffset - docEl.clientLeft;
      const top = rect.top + window.pageYOffset - docEl.clientTop;
      return { left, top };
    }

    // Hardware acceleration is always enabled; legacy toggle removed

    async function ensureThreeLoaded() {
      if (THREE && GLTFLoader) return; // already loaded
      if (!threeImportPromise) {
        threeImportPromise = (async () => {
          const resolvedThreePromise =
            (window.__threePromise && typeof window.__threePromise.then === 'function'
              ? window.__threePromise
              : window.THREE
                ? Promise.resolve(window.THREE)
                : null) || Promise.resolve(null);

          let threeMod = await resolvedThreePromise.catch(() => null);
          if (!threeMod) {
            try {
              const imported = await import('three');
              threeMod = imported && Object.keys(imported).length ? imported : imported.default;
            } catch (err) {
              console.error('[model-viewer] Failed to load three.js', err);
              throw err;
            }
            if (threeMod) {
              window.THREE = threeMod;
              window.__threePromise = Promise.resolve(threeMod);
            }
          }
          THREE = threeMod;

          const loaderPromise =
            window.__threeGltfLoaderPromise &&
            typeof window.__threeGltfLoaderPromise.then === 'function'
              ? window.__threeGltfLoaderPromise
              : Promise.resolve(null);

          let loaderMod = await loaderPromise.catch(() => null);
          if (!loaderMod || typeof loaderMod !== 'object') {
            try {
              loaderMod = await import('three/examples/jsm/loaders/GLTFLoader.js');
            } catch (err) {
              console.error('[model-viewer] Failed to load GLTFLoader', err);
              throw err;
            }
          }
          GLTFLoader = loaderMod.GLTFLoader || loaderMod.default || loaderMod;

          try {
            const meshoptMod = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
            MeshoptDecoder = meshoptMod.MeshoptDecoder || meshoptMod.default;
          } catch (err) {
            console.warn('[model-viewer] MeshoptDecoder not available', err);
          }

          try {
            const dracoMod = await import('three/examples/jsm/loaders/DRACOLoader.js');
            DRACOLoader = dracoMod.DRACOLoader || dracoMod.default;
          } catch (err) {
            console.warn('[model-viewer] DRACOLoader not available', err);
          }
        })();
      }
      await threeImportPromise;
    }

    function updateMagnet() {
      // Prefer generic helper when available
      if (typeof window.makeMagnetic === 'function') return;
      if (!bar || container.classList.contains('hidden')) return;
      const barRect = bar.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      if (!isAttachedToBar) {
        const distance = containerRect.bottom - barRect.top;
        const MAGNET_THRESHOLD = -0; // legacy behavior retained
        if (Math.abs(distance) < MAGNET_THRESHOLD) {
          isAttachedToBar = true;
          attachOffsetY = containerRect.top - barRect.top;
        }
      }
      if (isAttachedToBar) {
        container.style.top = `${barRect.top + attachOffsetY}px`;
      }
    }

    async function initThree() {
      await ensureThreeLoaded();
      if (!clock) clock = new THREE.Clock();
      const charKey = getCharacterKey(MODEL_PATH);
      const initCfg = CHARACTER_CONFIG[charKey] || CHARACTER_CONFIG.animebird;
      const width = container.clientWidth;
      const height = initCfg.height;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
      camera.position.set(0, initCfg.cameraY, initCfg.cameraZ);
      camera.lookAt(0, initCfg.lookAtY, 0);
      container.style.height = height + 'px';

      const ambient = new THREE.AmbientLight(0xffffff, 1.2);
      scene.add(ambient);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.appendChild(renderer.domElement);

      // Override CSS transform for accurate dragging
      const initPos = getCurrentPosition();
      container.style.left = `${initPos.left}px`;
      container.style.top = `${initPos.top}px`;
      container.style.transform = 'none';

      const resizeObserver = new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight || height;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      resizeObserver.observe(container);
      cleanupFns.push(() => {
        try {
          resizeObserver.disconnect();
        } catch (_) {}
      });

      // Three.js disposal cleanup
      cleanupFns.push(() => {
        clearAmbientTimer();

        // Cancel animation
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }

        // Dispose mixer
        if (mixer) {
          mixer.stopAllAction();
          mixer = null;
        }
        idleAction = null;
        ambientActions = [];
        tapActions = [];

        // Dispose model and scene objects
        if (scene) {
          scene.traverse((obj) => {
            if (obj.geometry) {
              obj.geometry.dispose();
            }
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach((m) => m.dispose());
              } else {
                obj.material.dispose();
              }
            }
          });
          scene.clear();
          scene = null;
        }

        // Dispose renderer
        if (renderer) {
          renderer.dispose();
          renderer.forceContextLoss();
          if (renderer.domElement?.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
          renderer = null;
        }

        model = null;
        camera = null;
        clock = null;
      });

      const loader = new GLTFLoader();
      if (MeshoptDecoder) loader.setMeshoptDecoder(MeshoptDecoder);
      if (DRACOLoader) {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        loader.setDRACOLoader(dracoLoader);
      }

      function loadWithFallback(urls, onSuccess, onError) {
        const tryNext = (idx = 0) => {
          if (idx >= urls.length) {
            onError?.(new Error('Model failed to load from all candidate URLs.'));
            return;
          }
          loader.load(urls[idx], onSuccess, undefined, (err) => {
            console.warn(`Model load failed for ${urls[idx]} – trying fallback`, err);
            tryNext(idx + 1);
          });
        };
        tryNext();
      }

      loadCurrentModel = function loadCurrentModelFn(path) {
        // Clean up previous model
        clearAmbientTimer();
        if (model && scene) {
          scene.remove(model);
          model.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
              else obj.material.dispose();
            }
          });
          model = null;
        }
        if (mixer) {
          mixer.stopAllAction();
          mixer = null;
        }
        idleAction = null;
        ambientActions = [];
        tapActions = [];

        const charKey = getCharacterKey(path);
        currentCharKey = charKey;
        const cfg = CHARACTER_CONFIG[charKey] || CHARACTER_CONFIG.animebird;

        loadWithFallback(
          [path],
          (gltf) => {
            model = gltf.scene;
            model.scale.set(cfg.scale, cfg.scale, cfg.scale);
            model.rotation.y = cfg.rotation;
            model.position.y = cfg.modelY || 0;
            scene.add(model);

            // Adjust camera and container for this character
            camera.position.set(0, cfg.cameraY, cfg.cameraZ);
            camera.lookAt(0, cfg.lookAtY, 0);
            const w = container.clientWidth;
            renderer.setSize(w, cfg.height);
            camera.aspect = w / cfg.height;
            camera.updateProjectionMatrix();
            container.style.height = cfg.height + 'px';

            // Collect all animations (base file + extra animation files)
            const allClips = gltf.animations ? [...gltf.animations] : [];
            mixer = new THREE.AnimationMixer(model);

            // Load extra animation files if this character has split GLBs
            const extraPaths = CHARACTER_EXTRA_ANIMS[charKey];
            if (extraPaths && extraPaths.length) {
              let loaded = 0;
              for (const animPath of extraPaths) {
                const fullPath = import.meta.env.BASE_URL + animPath;
                loader.load(
                  fullPath,
                  (animGltf) => {
                    if (animGltf.animations) {
                      allClips.push(...animGltf.animations);
                    }
                    // Dispose the extra scene (we only want the animation clip)
                    animGltf.scene.traverse((obj) => {
                      if (obj.geometry) obj.geometry.dispose();
                      if (obj.material) {
                        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
                        else obj.material.dispose();
                      }
                    });
                    loaded++;
                    if (loaded === extraPaths.length) {
                      // All extra animations loaded — classify and start
                      classifyAnimations(allClips, charKey);
                      startIdleLoop();
                      scheduleAmbient();
                    }
                  },
                  undefined,
                  (err) => {
                    console.warn('[model-viewer] Failed to load extra anim:', animPath, err);
                    loaded++;
                    if (loaded === extraPaths.length) {
                      classifyAnimations(allClips, charKey);
                      startIdleLoop();
                      scheduleAmbient();
                    }
                  }
                );
              }
            } else if (allClips.length) {
              // Single-file character — classify immediately
              classifyAnimations(allClips, charKey);
              startIdleLoop();
              scheduleAmbient();
            }
            if (!animationFrameId) animate();
          },
          undefined,
          (error) => console.error('Failed to load model', error)
        );
      };

      loadCurrentModel(MODEL_PATH);
    }

    function animate() {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      if (mixer) mixer.update(delta);
      renderer.render(scene, camera);
    }

    async function toggleVisibility(event) {
      event?.stopPropagation?.();
      // Always allowed
      const isHidden = container.classList.contains('hidden');
      if (isHidden) {
        container.classList.remove('hidden');
        container.setAttribute('aria-hidden', 'false');
        if (!renderer) await initThree();
        else if (!animationFrameId) animate();
        updateMagnet();
        scheduleAmbient();
        toggleBtn.classList.add('active');
      } else {
        container.classList.add('hidden');
        container.setAttribute('aria-hidden', 'true');
        clearAmbientTimer();
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        toggleBtn.classList.remove('active');
      }
    }

    // Hover controls removed — rotation handled via settings

    // Drag logic (parity with legacy)
    const DRAG_THRESHOLD = (window.AppSettings && window.AppSettings.dragThreshold) || 6; // px
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let isPointerDown = false;

    function onPointerDown(e) {
      isAttachedToBar = false;
      isPointerDown = true;
      isDragging = false;
      dragStartX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      dragStartY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      const pos = getCurrentPosition();
      initialLeft = pos.left;
      initialTop = pos.top;
      e.preventDefault();
    }
    function onPointerMove(e) {
      if (!isPointerDown) return;
      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      const dx = clientX - dragStartX;
      const dy = clientY - dragStartY;
      if (!isDragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        isDragging = true;
        container.classList.add('grabbing');
      }
      container.style.left = `${initialLeft + dx}px`;
      container.style.top = `${initialTop + dy}px`;
      e.stopPropagation();
      e.preventDefault();
    }
    function onPointerUp(e) {
      if (!isPointerDown) return;
      isPointerDown = false;
      if (isDragging) {
        isDragging = false;
        container.classList.remove('grabbing');
        updateMagnet();
        if (e) {
          e.stopPropagation();
          e.preventDefault();
        }
      }
    }

    function onContainerClick(e) {
      e.stopPropagation();
      playRandomTap();
    }
    function onContainerTouchEnd() {
      playRandomTap();
    }

    // Legacy hardwareAccelerationChange listener removed

    // Panel visibility: hide bird when side panels are open
    let panelOpen = false;
    let wasVisibleBeforePanel = false;

    function setModelViewerPanelOpen(open) {
      if (open && !panelOpen) {
        // Panel opening - hide bird if visible
        panelOpen = true;
        wasVisibleBeforePanel = !container.classList.contains('hidden');
        if (wasVisibleBeforePanel) {
          container.classList.add('panel-hidden');
          clearAmbientTimer();
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
          }
        }
      } else if (!open && panelOpen) {
        // Panel closing - restore bird if it was visible
        panelOpen = false;
        container.classList.remove('panel-hidden');
        if (wasVisibleBeforePanel && !container.classList.contains('hidden')) {
          if (!animationFrameId && renderer) animate();
          scheduleAmbient();
        }
      }
    }

    // Expose to window for side panel integration
    window.setModelViewerPanelOpen = setModelViewerPanelOpen;
    cleanupFns.push(() => {
      delete window.setModelViewerPanelOpen;
    });

    // Magnetic helper setup via Vue util
    try {
      makeMagnetic(container, { target: '#bar', threshold: 20, edge: 'top', detachOnDown: true });
    } catch (_) {}

    // Listeners
    toggleBtn.addEventListener('click', toggleVisibility);
    cleanupFns.push(() => toggleBtn.removeEventListener('click', toggleVisibility));

    container.addEventListener('click', onContainerClick);
    container.addEventListener('touchend', onContainerTouchEnd, { passive: false });
    cleanupFns.push(() => {
      container.removeEventListener('click', onContainerClick);
      container.removeEventListener('touchend', onContainerTouchEnd, { passive: false });
    });

    container.addEventListener('mousedown', onPointerDown);
    container.addEventListener('touchstart', onPointerDown, { passive: false });
    container.addEventListener('touchcancel', onPointerUp, { passive: false });
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchend', onPointerUp);
    window.addEventListener('touchcancel', onPointerUp, { passive: false });
    cleanupFns.push(() => {
      container.removeEventListener('mousedown', onPointerDown);
      container.removeEventListener('touchstart', onPointerDown, { passive: false });
      container.removeEventListener('touchcancel', onPointerUp, { passive: false });
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('touchmove', onPointerMove, { passive: false });
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchend', onPointerUp);
      window.removeEventListener('touchcancel', onPointerUp, { passive: false });
    });

    if (bar) {
      const barObserver = new MutationObserver(() => updateMagnet());
      barObserver.observe(bar, { attributes: true, attributeFilter: ['style'] });
      cleanupFns.push(() => {
        try {
          barObserver.disconnect();
        } catch (_) {}
      });
    }

    window.addEventListener('mouseup', updateMagnet);
    window.addEventListener('touchend', updateMagnet, { passive: false });
    window.addEventListener('resize', updateMagnet);
    window.addEventListener('scroll', updateMagnet);
    cleanupFns.push(() => {
      window.removeEventListener('mouseup', updateMagnet);
      window.removeEventListener('touchend', updateMagnet, { passive: false });
      window.removeEventListener('resize', updateMagnet);
      window.removeEventListener('scroll', updateMagnet);
    });

    // Register with intent coordinator for voice commands
    try {
      const { registerTarget, unregisterTarget } = useIntentCoordinator();
      registerTarget('model3d', {
        zone: null,
        actions: ['toggle'],
        handler: () => {
          toggleVisibility();
        },
      });
      cleanupFns.push(() => unregisterTarget('model3d'));
    } catch (_) {}

    // Listen for character model changes from settings
    const bus = useEventBus();
    function onCharacterChange(event) {
      if (event && event.path) {
        MODEL_PATH = import.meta.env.BASE_URL + event.path;
        if (scene && loadCurrentModel) {
          loadCurrentModel(MODEL_PATH);
        }
      }
    }
    bus.on('character:change', onCharacterChange);
    cleanupFns.push(() => bus.off('character:change', onCharacterChange));

    // no-op: hardware accel always on
  } catch (e) {
    console.error('[ModelViewer] init failed', e);
  }
});

onBeforeUnmount(() => {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch (_) {}
  });
  cleanupFns = [];
});
</script>
