import { marked } from 'marked';
import createDOMPurify from 'dompurify';
import * as THREE_NS from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

const hasWindow = typeof window !== 'undefined';
const pendingVendorResolvers =
  hasWindow && Array.isArray(window.__vendorReadyResolvers)
    ? window.__vendorReadyResolvers.splice(0)
    : [];
const THREE = THREE_NS;

let domPurifyInstance = null;
if (hasWindow) {
  try {
    domPurifyInstance = createDOMPurify(window);
  } catch (err) {
    console.warn('[vendor] Failed to initialise DOMPurify with window', err);
  }
}

const postprocessing = {
  EffectComposer: EffectComposer,
  RenderPass,
  UnrealBloomPass,
  SMAAPass,
};

if (hasWindow) {
  window.marked = marked;
  window.DOMPurify = domPurifyInstance || createDOMPurify(window);
  window.THREE = THREE;

  const resolvedThree = Promise.resolve(THREE);
  window.__threePromise = resolvedThree;
  window.__threeGltfLoaderPromise = Promise.resolve({ GLTFLoader });
  window.__threeOrbitControlsPromise = Promise.resolve({ OrbitControls });
  window.__threePostprocessingPromise = Promise.resolve(postprocessing);
  const readiness = Promise.all([
    resolvedThree.catch(() => null),
    window.__threeGltfLoaderPromise.catch(() => null),
    window.__threeOrbitControlsPromise.catch(() => null),
    window.__threePostprocessingPromise.catch(() => null),
  ]).then(() => {
    if (Array.isArray(window.__vendorReadyResolvers)) {
      window.__vendorReadyResolvers.length = 0;
    }
    if (pendingVendorResolvers.length) {
      pendingVendorResolvers.forEach((resolve) => {
        try {
          resolve();
        } catch (_) {}
      });
    }
    return undefined;
  });
  window.__vendorReadyPromise = readiness;
}

export {
  THREE,
  GLTFLoader,
  OrbitControls,
  postprocessing as ThreePostprocessingModules,
  marked,
  domPurifyInstance as DOMPurify,
};
