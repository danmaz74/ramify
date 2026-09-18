import { describe, expect, it } from 'vitest';
import { readFeatureTitles } from '../feature-titles.js';

const limits = { maxTitleBytes: 240, maxTitlesPerRecord: 40, maxResultBytes: 16 * 1024 * 1024 };

/** The `.feature` file of AV06's `titles` fixture. */
const feature = `# A comment: Scenario: not a title
@review
Feature:   Collection review
  Reviewers decide on submitted collections.

  Background:
    Given a submitted collection

  Scenario: A reviewer approves a collection
    When the reviewer approves it
    Then the collection is published

  @slow
  Scenario:\tA reviewer requests changes\t
    When the reviewer requests changes
    Then the author is notified
      """
      Scenario: quoted inside a doc string
      """

  Scenario Outline: A reviewer rates a collection <rating>
    When the reviewer rates it <rating>

    Examples:
      | rating |
      | 1      |

  Rule: Only reviewers decide

    Example: An author cannot approve their own collection
      When the author approves it
      Then the approval is refused
`;

describe('feature titles', () => {
  it('reads the feature and its scenario, outline and example titles in order, ignoring rules (AV06)', () => {
    expect(readFeatureTitles(feature, limits)).toEqual({
      feature: 'Collection review',
      scenarios: [
        'A reviewer approves a collection',
        'A reviewer requests changes',
        'A reviewer rates a collection <rating>',
        'An author cannot approve their own collection',
      ],
      cut: 0,
    });
  });

  it('recognizes English keywords only (AV06)', () => {
    const french = '# language: fr\nFonctionnalité: Revue\n  Scénario: Approuver\n  Plan du scénario: Noter\n  Exemple: Refuser\n';
    expect(readFeatureTitles(french, limits)).toEqual({ feature: null, scenarios: [], cut: 0 });
    // A keyword needs its colon and its case, and starts the line's text.
    const nearMisses = 'Feature Review\nscenario: lower case\nScenarios: tables\nExamples: tables\nGiven Scenario: inline\n  Scenario Template: kept\n';
    expect(readFeatureTitles(nearMisses, limits)).toEqual({ feature: null, scenarios: ['kept'], cut: 0 });
  });

  it('keeps the first feature title, reads CRLF text and a BOM, and cuts long titles on a character boundary', () => {
    const text = `\uFEFFFeature: First\r\nScenario: ${'b'.repeat(300)}\r\nFeature: Second\rScenario: x${'é'.repeat(149)}y\r\nScenario:\n`;
    const titles = readFeatureTitles(text, limits);
    expect(titles).toEqual({ feature: 'First', scenarios: [`${'b'.repeat(240)}…`, `x${'é'.repeat(119)}…`, ''], cut: 2 });
    expect(titles.scenarios.map(title => Buffer.byteLength(title.slice(0, -1)))).toEqual([240, 239, 0]);
    expect(readFeatureTitles('Feature: Review\n', { ...limits, maxTitleBytes: 3 })).toEqual({ feature: 'Rev…', scenarios: [], cut: 1 });
    expect(readFeatureTitles('', limits)).toEqual({ feature: null, scenarios: [], cut: 0 });
  });

  it('treats a doc string as text until its own delimiter closes it', () => {
    const text = 'Feature: Docs\n  Scenario: Before\n    """\n    ```\n    Scenario: inside\n    ```\n    """\n  Scenario: After\n'
      + '    ```\n    """\n    Scenario: also inside\n    ```\n  Scenario: Last\n';
    expect(readFeatureTitles(text, limits).scenarios).toEqual(['Before', 'After', 'Last']);
  });

  it('refuses limits that are not positive safe integers', () => {
    expect(() => readFeatureTitles(feature, { ...limits, maxTitleBytes: 0 })).toThrow(RangeError);
    expect(() => readFeatureTitles(feature, { ...limits, maxResultBytes: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });
});
