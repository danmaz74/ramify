import { plan1Instances } from './cases.js';
import { readReviewedPlan, validateInstancePointers, validateInstanceRecords } from './plan.js';

const issues = [
  ...validateInstanceRecords(plan1Instances, readReviewedPlan()),
  ...validateInstancePointers(plan1Instances),
];
if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${plan1Instances.length} Plan 1 instances, pointers and iteration prerequisites. No conformance assertion ran.`);
}
