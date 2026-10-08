# Written by ramify-agent for plan send-customer-email, run 20260923T1200Z-1a2b3c.
# The scenarios are the plan's requirements. Agents never edit this file;
# step definitions bind it from src/tests/steps/. @ramify-pending marks a
# scenario that nothing has bound or reported done yet.

Feature: email-history
  Description: Scenario by scenario, the #1 view of sent email @ a glance:
  every email a user sent to a customer, newest first, with its recipient and
  the time of sending, as a | table | row.

  @ramify-sc-002 @ramify-pending
  Scenario: Sent emails appear in the history
    Given an email to ada@example.com was sent
    When the user opens the email history
    Then the history lists one email to ada@example.com

  @ramify-sc-003
  Scenario Outline: The history lists emails newest first
    Given emails to <first> and <second> were sent in that order
    When the user opens the email history
    Then the history lists <second> before <first>
      """
      newest first
      """
    Examples:
      | first | second |
      | ada   | grace  |
