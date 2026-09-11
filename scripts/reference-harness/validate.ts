import { plan2Instances } from './plan2-instances.js';
import { plan1Instances } from './cases.js';
import { readReviewedPlan, readReviewedPlan2, validateInstancePointers, validateInstanceRecords } from './plan.js';

const issues = [
  ...validateInstanceRecords(plan2Instances, readReviewedPlan2()),
  ...validateInstancePointers(plan2Instances),
  ...validateInstanceRecords(plan1Instances, readReviewedPlan()),
  ...validateInstancePointers(plan1Instances),
];
if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${plan1Instances.length} Plan 1 and ${plan2Instances.length} Plan 2 instances, pointers and iteration prerequisites. No conformance assertion ran.`);
}
