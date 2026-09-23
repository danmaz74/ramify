# Written by ramify-agent for plan send-customer-email, run 20260923T1200Z-1a2b3c.
# The scenarios are the plan's requirements. Agents never edit this file;
# step definitions bind it from src/tests/steps/. @ramify-pending marks a
# scenario the harness has not yet declared due.

Feature: integration
  Plan send-customer-email: the scenarios that combine several entries, each
  bound here where its sub-scenarios' owners meet.

  @ramify-sc-005 @ramify-pending
  Scenario: A sent email is listed
    Given a customer with the address ada@example.com
    When the user activates email sending
    And the user opens the email history
    Then the history lists one email to ada@example.com
