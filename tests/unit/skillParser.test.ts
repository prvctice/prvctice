import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSkillDocument,
  validateSkillFrontmatter,
} from '../../web/services/skills/skillParser.js';
import {
  DEFAULT_SKILL_CATEGORIES,
  isDefaultCategory,
  DEFAULT_CATEGORY_NAMES,
} from '../../web/services/skills/skillCategories.js';

// ============================================================
// Test 1: Valid minimal skill (name + version + category only)
// ============================================================
describe('parseSkillDocument', () => {
  it('parses a valid minimal skill with required fields only', () => {
    const content = `---
name: Test Skill
version: 1.0.0
category: research
---
Body text`;

    const result = parseSkillDocument(content, 'test-skill.md');

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.data.frontmatter.name, 'Test Skill');
    assert.equal(result.data.frontmatter.version, '1.0.0');
    assert.deepEqual(result.data.frontmatter.category, 'research');
    assert.equal(result.data.body, 'Body text');
    assert.equal(result.data.fileName, 'test-skill.md');
  });

  // ============================================================
  // Test 2: Valid full skill (all fields)
  // ============================================================
  it('parses a valid full skill with all optional fields', () => {
    const content = `---
name: Research Synthesis
version: 2.1.0
category: research
description: Synthesizes research findings into structured summaries
triggers:
  keywords:
    - summarize
    - synthesize
    - research
  intent: "User wants to combine multiple sources into a coherent summary"
dependencies:
  - name: web-search
    optional: false
  - name: citation-formatter
    optional: true
model_hints:
  temperature: 0.7
  max_tokens: 4096
---

# Research Synthesis

Any free-form markdown content here. No required sections.
This is the skill body that gets composed into prompts.`;

    const result = parseSkillDocument(content, 'research-synthesis.md');

    assert.equal(result.success, true);
    if (!result.success) return;
    const { frontmatter, body } = result.data;
    assert.equal(frontmatter.name, 'Research Synthesis');
    assert.equal(frontmatter.version, '2.1.0');
    assert.deepEqual(frontmatter.category, 'research');
    assert.equal(
      frontmatter.description,
      'Synthesizes research findings into structured summaries'
    );
    assert.deepEqual(frontmatter.triggers?.keywords, ['summarize', 'synthesize', 'research']);
    assert.equal(
      frontmatter.triggers?.intent,
      'User wants to combine multiple sources into a coherent summary'
    );
    assert.equal(frontmatter.dependencies?.length, 2);
    assert.deepEqual(frontmatter.dependencies?.[0], { name: 'web-search', optional: false });
    assert.deepEqual(frontmatter.dependencies?.[1], { name: 'citation-formatter', optional: true });
    assert.deepEqual(frontmatter.model_hints, { temperature: 0.7, max_tokens: 4096 });
    assert.ok(body.includes('# Research Synthesis'));
    assert.ok(body.includes('free-form markdown'));
    assert.equal(result.data.fileName, 'research-synthesis.md');
  });

  // ============================================================
  // Test 3: Multi-category skill
  // ============================================================
  it('parses a multi-category skill with array of categories', () => {
    const content = `---
name: Multi Cat Skill
version: 1.0.0
category:
  - research
  - workflow
---
Body`;

    const result = parseSkillDocument(content, 'multi-cat.md');

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.deepEqual(result.data.frontmatter.category, ['research', 'workflow']);
  });

  // ============================================================
  // Test 4: Custom category (user-extensible)
  // ============================================================
  it('accepts custom categories beyond the five defaults', () => {
    const content = `---
name: Custom Cat Skill
version: 1.0.0
category: my-custom-category
---
Body`;

    const result = parseSkillDocument(content, 'custom-cat.md');

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.data.frontmatter.category, 'my-custom-category');
  });

  // ============================================================
  // Test 5: Missing name (required) -> error
  // ============================================================
  it('rejects a skill missing the required name field', () => {
    const content = `---
version: 1.0.0
category: research
---
Body`;

    const result = parseSkillDocument(content, 'missing-name.md');

    assert.equal(result.success, false);
    if (result.success) return;
    assert.ok(
      result.error.toLowerCase().includes('name'),
      `Error should mention "name": ${result.error}`
    );
  });

  // ============================================================
  // Test 6: Missing version (required) -> error
  // ============================================================
  it('rejects a skill missing the required version field', () => {
    const content = `---
name: Test
category: research
---
Body`;

    const result = parseSkillDocument(content, 'missing-version.md');

    assert.equal(result.success, false);
    if (result.success) return;
    assert.ok(
      result.error.toLowerCase().includes('version'),
      `Error should mention "version": ${result.error}`
    );
  });

  // ============================================================
  // Test 7: Invalid semver -> error
  // ============================================================
  it('rejects a skill with invalid semver version', () => {
    const content = `---
name: Test
version: 1.0
category: research
---
Body`;

    const result = parseSkillDocument(content, 'bad-version.md');

    assert.equal(result.success, false);
    if (result.success) return;
    assert.ok(
      result.error.toLowerCase().includes('semver') ||
        result.error.toLowerCase().includes('version'),
      `Error should mention semver or version: ${result.error}`
    );
  });

  // ============================================================
  // Test 8: Missing category (required) -> error
  // ============================================================
  it('rejects a skill missing the required category field', () => {
    const content = `---
name: Test
version: 1.0.0
---
Body`;

    const result = parseSkillDocument(content, 'missing-category.md');

    assert.equal(result.success, false);
    if (result.success) return;
    assert.ok(
      result.error.toLowerCase().includes('category'),
      `Error should mention "category": ${result.error}`
    );
  });

  // ============================================================
  // Test 9: Empty/missing frontmatter -> error
  // ============================================================
  it('rejects content without frontmatter delimiters', () => {
    const content = `Just markdown without frontmatter`;

    const result = parseSkillDocument(content, 'no-frontmatter.md');

    assert.equal(result.success, false);
    if (result.success) return;
    assert.ok(
      result.error.toLowerCase().includes('frontmatter'),
      `Error should mention frontmatter: ${result.error}`
    );
  });

  it('rejects content with empty frontmatter', () => {
    const content = `---
---
Body text`;

    const result = parseSkillDocument(content, 'empty-frontmatter.md');

    assert.equal(result.success, false);
    if (result.success) return;
    // Should fail validation since required fields are missing
    assert.ok(result.error.length > 0);
  });

  // ============================================================
  // Test 10: Optional triggers with keywords
  // ============================================================
  it('parses optional triggers with keywords and intent', () => {
    const content = `---
name: Search Skill
version: 1.0.0
category: tool
triggers:
  keywords:
    - search
    - find
  intent: "User wants to search"
---
Body`;

    const result = parseSkillDocument(content, 'search.md');

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.deepEqual(result.data.frontmatter.triggers?.keywords, ['search', 'find']);
    assert.equal(result.data.frontmatter.triggers?.intent, 'User wants to search');
  });

  // ============================================================
  // Test 11: Optional dependencies
  // ============================================================
  it('parses optional dependencies list', () => {
    const content = `---
name: Dep Skill
version: 1.0.0
category: workflow
dependencies:
  - name: other-skill
    optional: true
---
Body`;

    const result = parseSkillDocument(content, 'dep.md');

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.data.frontmatter.dependencies?.length, 1);
    assert.deepEqual(result.data.frontmatter.dependencies?.[0], {
      name: 'other-skill',
      optional: true,
    });
  });

  // ============================================================
  // Additional edge cases
  // ============================================================
  it('trims the body content', () => {
    const content = `---
name: Trim Test
version: 1.0.0
category: research
---

  Body with whitespace

`;

    const result = parseSkillDocument(content, 'trim.md');

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.data.body, 'Body with whitespace');
  });

  it('handles empty body gracefully', () => {
    const content = `---
name: No Body
version: 1.0.0
category: research
---`;

    const result = parseSkillDocument(content, 'nobody.md');

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.data.body, '');
  });
});

// ============================================================
// Test: validateSkillFrontmatter standalone
// ============================================================
describe('validateSkillFrontmatter', () => {
  it('validates valid frontmatter data', () => {
    const data = {
      name: 'Test',
      version: '1.0.0',
      category: 'research',
    };

    const result = validateSkillFrontmatter(data);

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.data.name, 'Test');
  });

  it('rejects invalid frontmatter data', () => {
    const data = {
      name: '',
      version: 'bad',
      category: '',
    };

    const result = validateSkillFrontmatter(data);

    assert.equal(result.success, false);
  });
});

// ============================================================
// Test 12: Default categories
// ============================================================
describe('DEFAULT_SKILL_CATEGORIES', () => {
  it('contains exactly five default categories', () => {
    assert.equal(DEFAULT_SKILL_CATEGORIES.length, 5);
  });

  it('includes research, curation, workflow, tool, behavioral', () => {
    const names = DEFAULT_SKILL_CATEGORIES.map((c) => c.name);
    assert.ok(names.includes('research'));
    assert.ok(names.includes('curation'));
    assert.ok(names.includes('workflow'));
    assert.ok(names.includes('tool'));
    assert.ok(names.includes('behavioral'));
  });

  it('each category has a name and description', () => {
    for (const cat of DEFAULT_SKILL_CATEGORIES) {
      assert.ok(typeof cat.name === 'string' && cat.name.length > 0);
      assert.ok(typeof cat.description === 'string' && cat.description.length > 0);
    }
  });
});

// ============================================================
// Test 13: Category check utility
// ============================================================
describe('isDefaultCategory', () => {
  it('returns true for default categories', () => {
    assert.equal(isDefaultCategory('research'), true);
    assert.equal(isDefaultCategory('curation'), true);
    assert.equal(isDefaultCategory('workflow'), true);
    assert.equal(isDefaultCategory('tool'), true);
    assert.equal(isDefaultCategory('behavioral'), true);
  });

  it('returns false for custom categories', () => {
    assert.equal(isDefaultCategory('my-custom'), false);
    assert.equal(isDefaultCategory(''), false);
    assert.equal(isDefaultCategory('Research'), false); // case-sensitive
  });
});

describe('DEFAULT_CATEGORY_NAMES', () => {
  it('is an array of the five default category name strings', () => {
    assert.equal(DEFAULT_CATEGORY_NAMES.length, 5);
    assert.ok(DEFAULT_CATEGORY_NAMES.includes('research'));
    assert.ok(DEFAULT_CATEGORY_NAMES.includes('curation'));
    assert.ok(DEFAULT_CATEGORY_NAMES.includes('workflow'));
    assert.ok(DEFAULT_CATEGORY_NAMES.includes('tool'));
    assert.ok(DEFAULT_CATEGORY_NAMES.includes('behavioral'));
  });
});
