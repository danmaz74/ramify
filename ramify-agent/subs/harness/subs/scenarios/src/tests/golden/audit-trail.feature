# Written by ramify-agent for plan send-customer-email, run 20260923T1200Z-1a2b3c.
# The scenarios are the plan's requirements. Agents never edit this file;
# step definitions bind it from src/steps/. @ramify-pending marks a
# scenario the harness has not yet declared due.

Feature: audit-trail
  Every send leaves one audit line.

  @ramify-sc-004 @ramify-pending
  Scenario: Every send is audited
    When the user activates email sending
    Then one audit line records the send
