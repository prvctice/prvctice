/**
 * Skill-Intent Bridge
 *
 * Thin connector between the Intent Coordinator (input routing) and the
 * Skill Coordinator (skill CRUD + execution). Neither system is modified;
 * this bridge registers intent targets that delegate to the skill system.
 *
 * Responsibilities:
 * 1. Register the skills dock as a spatial intent target so hand tracking
 *    and other spatial inputs can tap/interact with skill pills.
 * 2. Register a non-spatial "skillExecutor" target so gamepad/voice can
 *    execute skills by ID or name without spatial resolution.
 * 3. Watch for "release" intents on the inputBar target while a skill pill
 *    is being dragged, bridging intent-based drops to skill execution.
 */

import { useIntentCoordinator } from '@web/composables/useIntentCoordinator';
import { useSkillCoordinator } from '@web/composables/useSkillCoordinator';
import { useSkillPhysics } from '@web/composables/useSkillPhysics';
import { debugLog, logError } from '@web/utils/debugLog';

interface SkillIntentValue {
  skillId?: string;
  skillName?: string;
}

let initialized = false;
let cleanupAfterEmit: (() => void) | null = null;

/**
 * Handle tap intents on the skills dock.
 * Finds the pill under the tap position and executes it.
 */
function handleDockTap(position: { x: number; y: number }): void {
  const pill = findPillAtPosition(position.x, position.y);
  if (!pill) return;

  const skillId = pill.dataset.skillId;
  if (!skillId) return;

  debugLog('skills', 'bridge:dock-tap', { skillId });

  // Simulate a click on the pill, which triggers SkillsDock's executeSkill
  pill.click();
}

/**
 * Handle explicit skill execution from non-spatial inputs (gamepad, voice).
 */
function handleSkillExecute(value: unknown): void {
  const coordinator = useSkillCoordinator();
  const v = value as SkillIntentValue | undefined;

  const skillId = v?.skillId;
  const skillName = v?.skillName;

  if (skillId) {
    debugLog('skills', 'bridge:execute-by-id', { skillId });
    coordinator.execute(skillId).catch((err) => {
      logError('skills', 'bridge:execute-failed', err as Error);
    });
    return;
  }

  if (skillName) {
    // Find skill by title match (case-insensitive)
    const match = findSkillByName(skillName);
    if (match) {
      debugLog('skills', 'bridge:execute-by-name', { skillName, skillId: match });
      coordinator.execute(match).catch((err) => {
        logError('skills', 'bridge:execute-failed', err as Error);
      });
    } else {
      debugLog('skills', 'bridge:skill-not-found', { skillName });
    }
  }
}

/**
 * Find a skill ID by name (case-insensitive title match).
 */
function findSkillByName(name: string): string | null {
  const coordinator = useSkillCoordinator();
  const lower = name.toLowerCase();
  for (const skill of coordinator.skills.value.values()) {
    if (skill.title.toLowerCase() === lower) {
      return skill.id;
    }
  }
  return null;
}

/**
 * Find a pill DOM element at a given screen position.
 */
function findPillAtPosition(x: number, y: number): HTMLElement | null {
  const elements = document.elementsFromPoint(x, y);
  for (const el of elements) {
    const pill = (el as HTMLElement).closest?.('.skill-pill') as HTMLElement | null;
    if (pill?.dataset.skillId) {
      return pill;
    }
  }
  return null;
}

/**
 * Listen for release intents on inputBar while a skill is being dragged
 * via the intent system. This bridges intent-based drag-and-drop with
 * skill execution on the input bar.
 */
function installReleaseWatcher(): () => void {
  const { onAfterEmit } = useIntentCoordinator();
  const physics = useSkillPhysics();
  const coordinator = useSkillCoordinator();

  return onAfterEmit((intent, target) => {
    // Only care about release on the inputBar target
    if (intent.action !== 'release' || target?.id !== 'inputBar') return;

    // Check if a skill pill is being dragged via physics
    const draggingSkill = physics.draggingSkill.value;
    if (!draggingSkill) return;

    debugLog('skills', 'bridge:intent-drop-on-bar', { skillId: draggingSkill.id });

    coordinator.execute(draggingSkill.id).catch((err) => {
      logError('skills', 'bridge:drop-execute-failed', err as Error);
    });
  });
}

/**
 * Initialize the skill-intent bridge.
 * Call once during app setup (e.g., in AppShell.vue).
 * Returns a cleanup function.
 */
export function useSkillIntentBridge(): { initialize: () => () => void } {
  return {
    initialize() {
      if (initialized) {
        return () => {};
      }
      initialized = true;

      const { registerTarget, unregisterTarget } = useIntentCoordinator();

      // 1. Register the skills dock as a spatial intent target
      registerTarget('skillsDock', {
        zone: '#skill-carousel',
        actions: ['tap', 'grab', 'move', 'release'],
        priority: 1,
        handler: (intent) => {
          switch (intent.action) {
            case 'tap':
              if (intent.position) {
                handleDockTap(intent.position);
              }
              break;
            // grab/move/release are handled by the existing SkillsDock drag
            // system (imperative DOM). The intent target registration makes
            // the dock discoverable for spatial resolution so hand tracking
            // gestures land on it rather than falling through.
          }
        },
      });

      // 2. Register a non-spatial target for explicit skill execution
      registerTarget('skillExecutor', {
        zone: null,
        actions: ['execute', 'activate'],
        handler: (intent) => {
          handleSkillExecute(intent.value);
        },
      });

      // 3. Install the release-on-inputBar watcher
      cleanupAfterEmit = installReleaseWatcher();

      debugLog('skills', 'bridge:initialized', {});

      // Return cleanup
      return () => {
        unregisterTarget('skillsDock');
        unregisterTarget('skillExecutor');
        if (cleanupAfterEmit) {
          cleanupAfterEmit();
          cleanupAfterEmit = null;
        }
        initialized = false;
      };
    },
  };
}

export default useSkillIntentBridge;
