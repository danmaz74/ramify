# @viz-format: 1.0
# @viz-status: implemented
#
# The two lines above are ordinary Gherkin comments, and nothing in this
# package reads them. This file needs `@cucumber/cucumber` and nothing else:
# `.viz.feature` is only the extension `cucumber.js` is configured to collect.

Feature: Collection review
  Two fixed records, one deterministic review, and the two surfaces that serve
  it. The scenario below walks one reviewer's work through both of them: the
  typed tRPC client the browser uses, then an MCP session that binds itself to
  part of a record's history and reviews it again under that binding.

  Scenario: A reviewer inspects the catalog and reviews both records through both surfaces
    Given the configured collection-review system
    When I read the catalog through the typed client
    Then it lists "Intact revision history" and "Chain with a missing predecessor"
    When I review "rec-broken" through the typed client
    Then the review fails with the finding "missing-predecessor" on revision "rev-2"
    When I review "rec-valid" through the typed client
    Then the review passes with no findings
    When I open an MCP session and bind it to the latest 1 revision by reviewing "rec-valid"
    Then that session's tool listing describes the latest 1 revision
    And the session's review of "rec-valid" fails under that binding
    And the shared hook initialization ran exactly once
