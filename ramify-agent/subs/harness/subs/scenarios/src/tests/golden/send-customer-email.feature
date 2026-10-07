# Written by ramify-agent for plan send-customer-email, run 20260923T1200Z-1a2b3c.
# The scenarios are the plan's requirements. Agents never edit this file;
# step definitions bind it from src/tests/steps/. @ramify-pending marks a
# scenario that nothing has bound or reported done yet.

Feature: send-customer-email
  A user activates email sending for a customer, and that customer receives
  one email.

  @ramify-sc-001
  Scenario: A customer receives the email
    Given a customer with the address ada@example.com
    When the user activates email sending
    Then the customer ada@example.com receives one email
