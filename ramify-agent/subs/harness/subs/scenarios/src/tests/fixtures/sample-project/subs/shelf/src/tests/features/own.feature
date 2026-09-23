Feature: shelf basics
  The project's own scenarios, which no plan tracks.

  Scenario: An empty shelf lists nothing
    Given an empty shelf
    Then the shelf lists 0 books

  Scenario: A shelf with one book lists it
    Given an empty shelf
    When the user shelves "Emma"
    Then the shelf lists 1 book

  Scenario: An untracked scenario fails
    Given an empty shelf
    Then the shelf lists 5 books
