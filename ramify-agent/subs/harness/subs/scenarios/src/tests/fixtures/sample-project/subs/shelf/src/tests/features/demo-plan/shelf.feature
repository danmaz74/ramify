# Written by ramify-agent for plan demo-plan, run 20260923T1200Z-000000.
# The scenarios are the plan's requirements. Agents never edit this file;
# step definitions bind it from src/tests/steps/. @ramify-pending marks a
# scenario the harness has not yet declared due.

Feature: shelf-books
  A user shelves books, and the shelf lists them.

  @ramify-sc-001
  Scenario: A shelved book is listed
    Given an empty shelf
    When the user shelves "Dune"
    Then the shelf lists 1 book

  @ramify-sc-002
  Scenario: A miscounted shelf fails
    Given an empty shelf
    When the user shelves "Dune"
    Then the shelf lists 2 books

  @ramify-sc-003
  Scenario: Lending is not defined yet
    Given an empty shelf
    When the user lends "Dune" to Ada
    Then the shelf lists 0 books

  @ramify-sc-004
  Scenario: Dusting matches two definitions
    Given an empty shelf
    When the user dusts the shelf
    Then the shelf lists 0 books

  @ramify-sc-005
  Scenario: Sorting is pending
    Given an empty shelf
    When the user sorts the shelf
    Then the shelf lists 0 books

  @ramify-sc-006
  Scenario Outline: Several shelved books are listed
    Given an empty shelf
    When the user shelves <count> books
    Then the shelf lists <listed> books
    Examples:
      | count | listed |
      | 1     | 1      |
      | 2     | 3      |

  @ramify-sc-007 @ramify-pending
  Scenario: A bound scenario runs when its identity selects it
    Given an empty shelf
    Then the shelf lists 0 books
