import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import {
  createSkillRegistry,
  scoreSkillByKeywords,
  applyUsageBoost,
  type RegisteredSkill,
  type UsageRecord,
  type SkillRegistry,
} from '../../src/services/skillRegistry.js';

const SKILLS_DIR = path.join(__dirname, '..', '..', 'src', 'skills');

// ---------------------------------------------------------------------------
// Helper: create a synthetic RegisteredSkill for unit tests
// ---------------------------------------------------------------------------
function syntheticSkill(overrides: Partial<RegisteredSkill> = {}): RegisteredSkill {
  return {
    name: 'Test Skill',
    category: 'research',
    description: 'A test skill',
    body: 'Test body content',
    bodyTokens: 10,
    triggers: { keywords: ['test', 'example'], intent: 'testing' },
    filePath: '/fake/path/test.md',
    isAgent: false,
    ...overrides,
  };
}

// ===========================================================================
// Registry tests
// ===========================================================================

test('createSkillRegistry discovers all .md files in skills/ subdirectories', async () => {
  const registry = createSkillRegistry(SKILLS_DIR);
  // 4 agents + 7 playbooks = 11 total
  assert.equal(registry.skills.length, 11);
});

test('Registry returns correct count of agents vs playbooks', async () => {
  const registry = createSkillRegistry(SKILLS_DIR);
  const agents = registry.getAgents();
  const playbooks = registry.getPlaybooks();
  assert.equal(agents.length, 4);
  assert.equal(playbooks.length, 7);
});

test('Each RegisteredSkill has required fields with correct types', async () => {
  const registry = createSkillRegistry(SKILLS_DIR);
  for (const skill of registry.skills) {
    assert.equal(typeof skill.name, 'string');
    assert.ok(skill.name.length > 0, `name should be non-empty`);

    // category can be string or string[]
    assert.ok(
      typeof skill.category === 'string' || Array.isArray(skill.category),
      'category should be string or string[]'
    );

    assert.equal(typeof skill.body, 'string');
    assert.ok(skill.body.length > 0, `body should be non-empty`);

    assert.equal(typeof skill.bodyTokens, 'number');
    assert.ok(skill.bodyTokens > 0, `bodyTokens should be > 0`);

    assert.ok(Array.isArray(skill.triggers.keywords), 'triggers.keywords should be an array');
    assert.equal(typeof skill.triggers.intent, 'string');

    assert.equal(typeof skill.filePath, 'string');
    assert.ok(skill.filePath.endsWith('.md'), 'filePath should end with .md');

    assert.equal(typeof skill.isAgent, 'boolean');
  }
});

test('getByKeywords(["film", "director"]) returns film-research skill', async () => {
  const registry = createSkillRegistry(SKILLS_DIR);
  const results = registry.getByKeywords(['film', 'director']);
  const names = results.map((s) => s.name);
  assert.ok(
    names.includes('Film Research'),
    `Expected "Film Research" in ${JSON.stringify(names)}`
  );
});

test('getByCategory("research") returns all research-category skills', async () => {
  const registry = createSkillRegistry(SKILLS_DIR);
  const results = registry.getByCategory('research');
  // Researcher agent + Film Research + Book & Essay Research + Research Synthesis = 4
  assert.equal(results.length, 4);
  for (const skill of results) {
    const cats = Array.isArray(skill.category) ? skill.category : [skill.category];
    assert.ok(cats.includes('research'), `${skill.name} should have "research" category`);
  }
});

test('getAgents() returns only agent skills', async () => {
  const registry = createSkillRegistry(SKILLS_DIR);
  const agents = registry.getAgents();
  for (const agent of agents) {
    assert.equal(agent.isAgent, true, `${agent.name} should be an agent`);
  }
});

test('getPlaybooks() returns only playbook skills', async () => {
  const registry = createSkillRegistry(SKILLS_DIR);
  const playbooks = registry.getPlaybooks();
  for (const playbook of playbooks) {
    assert.equal(playbook.isAgent, false, `${playbook.name} should not be an agent`);
  }
});

test('Registry caches results; calling again without file changes returns same reference', async () => {
  const registry = createSkillRegistry(SKILLS_DIR);
  const first = registry.skills;
  const second = registry.skills;
  assert.equal(first, second, 'skills array reference should be identical (cached)');
});

test('refresh() forces re-scan of skill files', async () => {
  const registry = createSkillRegistry(SKILLS_DIR);
  const first = registry.skills;
  registry.refresh();
  const second = registry.skills;
  // After refresh, should still have same count but be a new array reference
  assert.equal(second.length, first.length);
  assert.notEqual(first, second, 'skills array reference should differ after refresh()');
});

// ===========================================================================
// Scoring tests
// ===========================================================================

test('scoreSkillByKeywords returns 0 when no keywords match', async () => {
  const skill = syntheticSkill({
    triggers: { keywords: ['unrelated', 'nothing'], intent: 'none' },
  });
  const score = scoreSkillByKeywords(new Set(['film', 'director']), skill, {});
  assert.equal(score, 0);
});

test('scoreSkillByKeywords returns positive score when keywords match', async () => {
  const skill = syntheticSkill({
    triggers: { keywords: ['film', 'director', 'movie'], intent: 'film research' },
  });
  const score = scoreSkillByKeywords(new Set(['film', 'director']), skill, {});
  assert.ok(score > 0, `Score should be positive, got ${score}`);
});

test('Higher match density = higher score', async () => {
  const skill = syntheticSkill({
    triggers: { keywords: ['film', 'director', 'movie', 'cinema'], intent: 'film' },
  });
  const lowDensity = scoreSkillByKeywords(new Set(['film']), skill, {});
  const highDensity = scoreSkillByKeywords(new Set(['film', 'director', 'movie']), skill, {});
  assert.ok(
    highDensity > lowDensity,
    `High density (${highDensity}) should exceed low density (${lowDensity})`
  );
});

test('Specificity bonus: matching 3/6 keywords scores higher than 1/6', async () => {
  const skill = syntheticSkill({
    triggers: {
      keywords: ['film', 'director', 'movie', 'cinema', 'filmography', 'screening'],
      intent: 'film',
    },
  });
  const oneMatch = scoreSkillByKeywords(new Set(['film', 'xyz', 'abc']), skill, {});
  const threeMatch = scoreSkillByKeywords(new Set(['film', 'director', 'movie']), skill, {});
  assert.ok(
    threeMatch > oneMatch,
    `Three matches (${threeMatch}) should exceed one match (${oneMatch})`
  );
});

test('Agent context bias: matching category gets 30% boost', async () => {
  const skill = syntheticSkill({
    category: 'research',
    triggers: { keywords: ['research', 'find'], intent: 'research' },
  });
  const withoutBias = scoreSkillByKeywords(new Set(['research']), skill, {});
  const withBias = scoreSkillByKeywords(new Set(['research']), skill, {
    agentCategory: 'research',
  });
  assert.ok(withBias > withoutBias, `Biased (${withBias}) should exceed unbiased (${withoutBias})`);
  // The boost should be approximately 30%
  const ratio = withBias / withoutBias;
  assert.ok(ratio >= 1.25 && ratio <= 1.35, `Ratio should be ~1.3, got ${ratio}`);
});

test('Multi-word keywords: "film research" matches when both words present', async () => {
  const skill = syntheticSkill({
    triggers: { keywords: ['film research', 'synthesis'], intent: 'research' },
  });
  const score = scoreSkillByKeywords(new Set(['film', 'research', 'project']), skill, {});
  assert.ok(score > 0, `Multi-word keyword should match, got ${score}`);
});

test('Score is capped at 1.0', async () => {
  // Create skill with many keywords that all match, plus context bias
  const skill = syntheticSkill({
    category: 'research',
    triggers: { keywords: ['a', 'b'], intent: 'test' },
  });
  const score = scoreSkillByKeywords(new Set(['a', 'b']), skill, { agentCategory: 'research' });
  assert.ok(score <= 1.0, `Score should be capped at 1.0, got ${score}`);
});

// ===========================================================================
// Usage boost tests
// ===========================================================================

test('applyUsageBoost returns original score when no history', async () => {
  const score = applyUsageBoost(0.5, 'test-skill', []);
  assert.equal(score, 0.5);
});

test('Usage history with count > 0 increases score via logarithmic decay', async () => {
  const history: ReadonlyArray<UsageRecord> = [
    { skillName: 'test-skill', count: 10, lastUsed: Date.now() - 7200000 },
  ];
  const boosted = applyUsageBoost(0.5, 'test-skill', history);
  assert.ok(boosted > 0.5, `Boosted (${boosted}) should exceed original (0.5)`);
});

test('Recency boost: skill used in last hour gets extra 0.05 boost', async () => {
  const recentHistory: ReadonlyArray<UsageRecord> = [
    { skillName: 'test-skill', count: 5, lastUsed: Date.now() - 1800000 }, // 30 min ago
  ];
  const oldHistory: ReadonlyArray<UsageRecord> = [
    { skillName: 'test-skill', count: 5, lastUsed: Date.now() - 7200000 }, // 2 hours ago
  ];
  const recentBoosted = applyUsageBoost(0.5, 'test-skill', recentHistory);
  const oldBoosted = applyUsageBoost(0.5, 'test-skill', oldHistory);
  const diff = recentBoosted - oldBoosted;
  assert.ok(Math.abs(diff - 0.05) < 0.001, `Recency difference should be ~0.05, got ${diff}`);
});

test('Boosted score is capped at 1.0', async () => {
  const history: ReadonlyArray<UsageRecord> = [
    { skillName: 'test-skill', count: 1000000, lastUsed: Date.now() },
  ];
  const boosted = applyUsageBoost(0.95, 'test-skill', history);
  assert.ok(boosted <= 1.0, `Boosted score should be capped at 1.0, got ${boosted}`);
});
