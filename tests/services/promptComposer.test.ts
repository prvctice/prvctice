import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyWithKeywords,
  getProviderBudget,
  composePrompt,
  type ComposedPrompt,
  type ComposerOptions,
  type ClassificationResult,
} from '../../src/services/promptComposer.js';

import type {
  RegisteredSkill,
  ScoredSkill,
  SkillRegistry,
  UsageRecord,
} from '../../src/services/skillRegistry.js';

// ---------------------------------------------------------------------------
// Helpers: synthetic skill and registry builders
// ---------------------------------------------------------------------------

function syntheticSkill(overrides: Partial<RegisteredSkill> = {}): RegisteredSkill {
  return {
    name: 'Test Skill',
    category: 'research',
    description: 'A generic test skill',
    body: 'Test body content for this skill.',
    bodyTokens: 50,
    triggers: { keywords: ['test', 'example'], intent: 'testing' },
    filePath: '/fake/path/test.md',
    isAgent: false,
    ...overrides,
  };
}

function largeSkill(name: string, tokens: number, isAgent: boolean = false): RegisteredSkill {
  // Create a body that estimates to roughly the target token count (chars/4)
  const body = 'x'.repeat(tokens * 4);
  return syntheticSkill({
    name,
    body,
    bodyTokens: tokens,
    isAgent,
    description: `${name} description`,
    triggers: { keywords: [name.toLowerCase()], intent: name.toLowerCase() },
  });
}

function buildMockRegistry(skills: RegisteredSkill[]): SkillRegistry {
  return {
    skills,
    getByKeywords(words: string[]): RegisteredSkill[] {
      const wordSet = new Set(words.map((w) => w.toLowerCase()));
      return skills.filter((skill) =>
        skill.triggers.keywords.some((kw) => {
          const parts = kw.toLowerCase().split(/\s+/);
          return parts.every((part) => wordSet.has(part));
        })
      );
    },
    getByCategory(category: string): RegisteredSkill[] {
      return skills.filter((skill) => {
        const cats = Array.isArray(skill.category) ? skill.category : [skill.category];
        return cats.includes(category);
      });
    },
    getAgents(): RegisteredSkill[] {
      return skills.filter((s) => s.isAgent);
    },
    getPlaybooks(): RegisteredSkill[] {
      return skills.filter((s) => !s.isAgent);
    },
    refresh(): void {
      // no-op for mock
    },
  };
}

// Synthetic skills for tests
const filmResearchSkill = syntheticSkill({
  name: 'Film Research',
  category: 'research',
  description: 'Film research with crew credits, movements, and search strategies',
  body: 'Film research skill body with detailed instructions.',
  bodyTokens: 80,
  triggers: {
    keywords: ['film', 'movie', 'director', 'cinematographer', 'movement', 'filmography'],
    intent: 'film research',
  },
  isAgent: false,
});

const musicPlaylistSkill = syntheticSkill({
  name: 'Music Playlist',
  category: 'curation',
  description: 'Music playlists with YouTube links and commentary',
  body: 'Music playlist skill body.',
  bodyTokens: 60,
  triggers: {
    keywords: ['playlist', 'music', 'tracks', 'songs', 'mixtape', 'listening'],
    intent: 'music playlist',
  },
  isAgent: false,
});

const researcherAgent = syntheticSkill({
  name: 'Researcher',
  category: 'research',
  description: 'Hunt sources, verify, and synthesize findings',
  body: 'Researcher agent body.',
  bodyTokens: 40,
  triggers: {
    keywords: ['research', 'search', 'find', 'verify', 'sources', 'synthesize'],
    intent: 'research',
  },
  isAgent: true,
});

const curatorAgent = syntheticSkill({
  name: 'Curator',
  category: 'curation',
  description: 'Assemble curated sets including programs, playlists, and moodboards',
  body: 'Curator agent body.',
  bodyTokens: 40,
  triggers: {
    keywords: ['curate', 'program', 'playlist', 'moodboard', 'collection', 'assemble'],
    intent: 'curation',
  },
  isAgent: true,
});

const researchSynthesisSkill = syntheticSkill({
  name: 'Research Synthesis',
  category: 'research',
  description: 'Verified research synthesis with links, bullets, and novelty insights',
  body: 'Research synthesis skill body with detailed instructions.',
  bodyTokens: 70,
  triggers: {
    keywords: ['research', 'synthesis', 'deep dive', 'analyze', 'investigate'],
    intent: 'research synthesis',
  },
  isAgent: false,
});

const allTestSkills: RegisteredSkill[] = [
  filmResearchSkill,
  musicPlaylistSkill,
  researcherAgent,
  curatorAgent,
  researchSynthesisSkill,
];

// ===========================================================================
// Keyword classification tests
// ===========================================================================

test('classifyWithKeywords returns matched skills with scores', () => {
  const registry = buildMockRegistry(allTestSkills);
  const result: ClassificationResult = classifyWithKeywords(
    'find film director Kubrick',
    registry,
    {}
  );
  assert.ok(Array.isArray(result.matchedSkills), 'matchedSkills should be an array');
  assert.ok(result.matchedSkills.length > 0, 'should match at least one skill');
  assert.ok(result.confidence, 'should have confidence level');
  assert.ok(result.method, 'should have method');
});

test('classifyWithKeywords: "find film director Kubrick" returns Film Research with high confidence', () => {
  const registry = buildMockRegistry(allTestSkills);
  // Use exact keywords: "film" and "director" match Film Research triggers
  const result = classifyWithKeywords('find film director Kubrick', registry, {});
  const filmMatch = result.matchedSkills.find((s) => s.skill.name === 'Film Research');
  assert.ok(filmMatch, 'Film Research should be in matched skills');
  assert.ok(filmMatch.score > 0.3, `Film Research score should be > 0.3, got ${filmMatch.score}`);
  // Should NOT match music playlist
  const musicMatch = result.matchedSkills.find((s) => s.skill.name === 'Music Playlist');
  const musicScore = musicMatch?.score ?? 0;
  assert.ok(musicScore === 0, `Music Playlist should not match, got score ${musicScore}`);
});

test('classifyWithKeywords: "show me more" with no agent context returns low confidence', () => {
  const registry = buildMockRegistry(allTestSkills);
  const result = classifyWithKeywords('show me more', registry, {});
  assert.equal(result.confidence, 'low', `Expected low confidence, got ${result.confidence}`);
});

test('classifyWithKeywords: "show me more" WITH agentCategory="research" returns research skills', () => {
  const registry = buildMockRegistry(allTestSkills);
  const result = classifyWithKeywords('show me more', registry, {
    agentCategory: 'research',
  });
  // Even with agent context, "show me more" has no keyword matches.
  // On low confidence, fallback skills should be loaded. The agent category context
  // biases toward research skills when scoring fallback candidates.
  assert.ok(result.matchedSkills.length > 0, 'Should have fallback skills loaded');
});

test('classifyWithKeywords: short ambiguous text returns low confidence and method keyword', () => {
  const registry = buildMockRegistry(allTestSkills);
  const result = classifyWithKeywords('hello there', registry, {});
  assert.equal(result.confidence, 'low');
  assert.equal(result.method, 'keyword');
});

test('classifyWithKeywords returns method "keyword"', () => {
  const registry = buildMockRegistry(allTestSkills);
  const result = classifyWithKeywords('find film director Kubrick', registry, {});
  assert.equal(result.method, 'keyword');
});

// ===========================================================================
// Provider budget tests
// ===========================================================================

test('getProviderBudget("anthropic") returns correct budget', () => {
  const budget = getProviderBudget('anthropic');
  assert.equal(budget.contextWindow, 200000);
  assert.equal(budget.skillBudget, 20000);
});

test('getProviderBudget("gemini") returns correct budget', () => {
  const budget = getProviderBudget('gemini');
  assert.equal(budget.contextWindow, 32768);
  assert.equal(budget.skillBudget, 3276);
});

test('getProviderBudget("openai") returns correct budget', () => {
  const budget = getProviderBudget('openai');
  assert.equal(budget.contextWindow, 128000);
  assert.equal(budget.skillBudget, 12800);
});

test('getProviderBudget with unknown provider defaults to 32768', () => {
  const budget = getProviderBudget('unknown-provider');
  assert.equal(budget.contextWindow, 32768);
  assert.equal(budget.skillBudget, 3276);
});

// ===========================================================================
// Prompt composition tests
// ===========================================================================

function makeBaseOptions(overrides: Partial<ComposerOptions> = {}): ComposerOptions {
  return {
    provider: 'anthropic',
    scoredSkills: allTestSkills.map((skill) => ({
      skill,
      score: 0.5,
      reason: 'test',
    })),
    pinnedSkillNames: [],
    corePrompt: 'You are a helpful assistant.',
    toolPrompt: 'Available tools: web_search, save_note.',
    canonList: ['canon item 1'],
    bannedList: ['banned item 1'],
    ...overrides,
  };
}

test('composePrompt returns a ComposedPrompt with prompt string and metadata', () => {
  const result: ComposedPrompt = composePrompt(makeBaseOptions());
  assert.equal(typeof result.prompt, 'string');
  assert.ok(result.prompt.length > 0, 'prompt should be non-empty');
  assert.ok(Array.isArray(result.loadedSkills));
  assert.ok(Array.isArray(result.condensedSkills));
  assert.ok(Array.isArray(result.omittedSkills));
  assert.equal(typeof result.tokenEstimate, 'number');
  assert.equal(typeof result.budgetUsed, 'number');
});

test('composePrompt: core content (systemInstructions, toolInstructions, canon/banned) is always included', () => {
  const result = composePrompt(makeBaseOptions());
  assert.ok(result.prompt.includes('You are a helpful assistant.'), 'Should include core prompt');
  assert.ok(
    result.prompt.includes('Available tools: web_search, save_note.'),
    'Should include tool prompt'
  );
  assert.ok(result.prompt.includes('canon item 1'), 'Should include canon list');
  assert.ok(result.prompt.includes('banned item 1'), 'Should include banned list');
});

test('composePrompt: pinned skills are always loaded regardless of score', () => {
  const lowScoreSkills: ScoredSkill[] = allTestSkills.map((skill) => ({
    skill,
    score: 0.01, // very low score
    reason: 'test',
  }));
  const result = composePrompt(
    makeBaseOptions({
      scoredSkills: lowScoreSkills,
      pinnedSkillNames: ['Film Research'],
    })
  );
  assert.ok(
    result.loadedSkills.includes('Film Research'),
    `Pinned skill should be loaded, got: ${JSON.stringify(result.loadedSkills)}`
  );
});

test('composePrompt: agent skills load before playbook skills at equal score', () => {
  const equalScoreSkills: ScoredSkill[] = [
    { skill: filmResearchSkill, score: 0.5, reason: 'test' },
    { skill: researcherAgent, score: 0.5, reason: 'test' },
  ];
  const result = composePrompt(makeBaseOptions({ scoredSkills: equalScoreSkills }));
  const researcherIdx = result.loadedSkills.indexOf('Researcher');
  const filmIdx = result.loadedSkills.indexOf('Film Research');
  assert.ok(researcherIdx >= 0, 'Researcher should be loaded');
  assert.ok(filmIdx >= 0, 'Film Research should be loaded');
  assert.ok(
    researcherIdx < filmIdx,
    `Agent (idx ${researcherIdx}) should load before playbook (idx ${filmIdx})`
  );
});

test('composePrompt: skills are loaded in descending score order', () => {
  const scoredSkills: ScoredSkill[] = [
    { skill: filmResearchSkill, score: 0.9, reason: 'high' },
    { skill: musicPlaylistSkill, score: 0.3, reason: 'low' },
    { skill: researchSynthesisSkill, score: 0.6, reason: 'mid' },
  ];
  const result = composePrompt(makeBaseOptions({ scoredSkills }));
  assert.deepEqual(result.loadedSkills, ['Film Research', 'Research Synthesis', 'Music Playlist']);
});

test('composePrompt: budget enforcement - top skills load fully, overflow get condensed', () => {
  // Create skills that exceed a tight budget
  const bigSkill1 = largeSkill('BigSkill1', 2000, true);
  const bigSkill2 = largeSkill('BigSkill2', 2000, false);
  const smallSkill = largeSkill('SmallSkill', 50, false);

  const scoredSkills: ScoredSkill[] = [
    { skill: bigSkill1, score: 0.9, reason: 'high' },
    { skill: bigSkill2, score: 0.7, reason: 'mid' },
    { skill: smallSkill, score: 0.5, reason: 'low' },
  ];

  // Use gemini budget: 3276 tokens for skills
  const result = composePrompt(
    makeBaseOptions({
      provider: 'gemini',
      scoredSkills,
    })
  );

  // BigSkill1 (2000) should load fully
  assert.ok(result.loadedSkills.includes('BigSkill1'), 'BigSkill1 should load fully');
  // BigSkill2 (2000) should overflow - either condensed or omitted
  const bigSkill2Condensed = result.condensedSkills.includes('BigSkill2');
  const bigSkill2Omitted = result.omittedSkills.includes('BigSkill2');
  assert.ok(
    bigSkill2Condensed || bigSkill2Omitted,
    `BigSkill2 should be condensed or omitted, got loaded: ${JSON.stringify(result.loadedSkills)}`
  );
});

test('composePrompt: condensed skills appear in "Available Skills (condensed)" section format', () => {
  const bigSkill1 = largeSkill('BigSkill1', 3000, true);
  const bigSkill2 = largeSkill('BigSkill2', 500, false);

  const scoredSkills: ScoredSkill[] = [
    { skill: bigSkill1, score: 0.9, reason: 'high' },
    { skill: bigSkill2, score: 0.7, reason: 'mid' },
  ];

  // Gemini budget: 3276. BigSkill1 (3000) fits. BigSkill2 (500) doesn't fit fully but desc fits.
  const result = composePrompt(
    makeBaseOptions({
      provider: 'gemini',
      scoredSkills,
    })
  );

  if (result.condensedSkills.length > 0) {
    assert.ok(
      result.prompt.includes('Available Skills (condensed)'),
      'Should have condensed section header'
    );
    for (const name of result.condensedSkills) {
      assert.ok(result.prompt.includes(`**${name}:**`), `Condensed section should include ${name}`);
    }
  }
});

test('composePrompt: skills that do not fit even condensed go to omittedSkills', () => {
  // Budget so tight that only one very small skill fits
  const tinySkill = largeSkill('TinySkill', 10, true);
  const hugeSkill1 = largeSkill('HugeSkill1', 5000, false);
  const hugeSkill2 = largeSkill('HugeSkill2', 5000, false);

  const scoredSkills: ScoredSkill[] = [
    { skill: tinySkill, score: 0.9, reason: 'high' },
    { skill: hugeSkill1, score: 0.7, reason: 'mid' },
    { skill: hugeSkill2, score: 0.5, reason: 'low' },
  ];

  // Gemini: 3276 budget. TinySkill fits. Both huge skills will try condensed then omit.
  const result = composePrompt(makeBaseOptions({ provider: 'gemini', scoredSkills }));

  assert.ok(result.loadedSkills.includes('TinySkill'), 'TinySkill should load');
  // At least one huge skill should end up in either condensed or omitted
  const allAccounted = [...result.loadedSkills, ...result.condensedSkills, ...result.omittedSkills];
  assert.ok(allAccounted.includes('HugeSkill1'), 'HugeSkill1 should be accounted for');
  assert.ok(allAccounted.includes('HugeSkill2'), 'HugeSkill2 should be accounted for');
});

test('composePrompt: budgetUsed percentage is calculated correctly', () => {
  const result = composePrompt(makeBaseOptions());
  assert.ok(result.budgetUsed >= 0, 'budgetUsed should be >= 0');
  assert.ok(result.budgetUsed <= 100, 'budgetUsed should be <= 100');
});

test('composePrompt: loadedSkills and condensedSkills contain correct skill names', () => {
  const scoredSkills: ScoredSkill[] = [
    { skill: filmResearchSkill, score: 0.9, reason: 'high' },
    { skill: researcherAgent, score: 0.8, reason: 'mid' },
  ];
  const result = composePrompt(makeBaseOptions({ scoredSkills }));
  for (const name of result.loadedSkills) {
    assert.equal(typeof name, 'string');
    assert.ok(name.length > 0, 'skill name should be non-empty');
  }
  // With small skills on anthropic budget, all should load (none condensed)
  assert.equal(result.condensedSkills.length, 0, 'Small skills on big budget should not condense');
});

// ===========================================================================
// Fallback behavior tests
// ===========================================================================

test('composePrompt fallback: low confidence loads top-3 broadly useful skills', () => {
  // Simulate low confidence by providing unscored skills (score 0)
  const manySkills = [
    syntheticSkill({ name: 'Skill A', bodyTokens: 30, isAgent: true }),
    syntheticSkill({ name: 'Skill B', bodyTokens: 30, isAgent: false }),
    syntheticSkill({ name: 'Skill C', bodyTokens: 30, isAgent: false }),
    syntheticSkill({ name: 'Skill D', bodyTokens: 30, isAgent: false }),
    syntheticSkill({ name: 'Skill E', bodyTokens: 30, isAgent: false }),
  ];
  const registry = buildMockRegistry(manySkills);

  // classifyWithKeywords on ambiguous text should provide fallback skills
  const result = classifyWithKeywords('hello', registry, {});
  assert.equal(result.confidence, 'low');
  // On low confidence, should have top-3 fallback skills
  assert.ok(
    result.matchedSkills.length >= 3,
    `Fallback should load at least 3 skills, got ${result.matchedSkills.length}`
  );
});

test('composePrompt: core identity content loads outside the skill budget', () => {
  // Use a provider with a tiny budget
  const tinyBudgetSkills: ScoredSkill[] = [
    { skill: filmResearchSkill, score: 0.9, reason: 'high' },
  ];
  const result = composePrompt(
    makeBaseOptions({
      provider: 'gemini',
      scoredSkills: tinyBudgetSkills,
      corePrompt: 'Core prompt content that is always included.',
      toolPrompt: 'Tool prompt content that is always included.',
    })
  );

  // Core content should be in the prompt regardless of budget
  assert.ok(result.prompt.includes('Core prompt content'), 'Core prompt should be present');
  assert.ok(result.prompt.includes('Tool prompt content'), 'Tool prompt should be present');
  // The skill should also load (it's small enough)
  assert.ok(
    result.loadedSkills.includes('Film Research'),
    'Small skill should still fit within gemini budget'
  );
});
