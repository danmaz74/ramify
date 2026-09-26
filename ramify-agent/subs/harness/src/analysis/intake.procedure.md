<!-- ramify-agent intake procedure, version 1. -->
1. Read every captured plan document in the message in full.
2. Write the plan's `goal`: a few sentences, close to the plan's own words,
   that say what the plan delivers and why. The readers of the principles
   documents use it to judge which of their rules bear on this plan.
3. Submit the plan's `non-functional` elements and its `recommendation`
   elements, each from the plan document that states it. Do not submit
   functional or context elements: the architect reads those. Submit an
   empty list only when the plan states no constraint and no suggestion.
4. Judge each captured plan document once in `incorporation.documents`:
   `scenarios` is true when its `gherkin` blocks are binding acceptance
   scenarios of this plan, with your uncertainty. A linked example can stay
   unincorporated.
5. Judge every missing reference of the message once in
   `incorporation.missing` as `required`, `unclear` or `advisory`, from the
   surrounding source text, with your reason. A required missing document
   cannot be accepted; report it so the run stops before implementation.
6. Submit with `{{submissionTool}}`.
