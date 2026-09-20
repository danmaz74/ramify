# Contracts

Contracts owns the neutral vocabulary that the catalog side and the review side
both speak: record and revision identity, revision chains, inspection reports,
findings, review status, the scope an inspection covers, and the observations it
emits. Keeping that vocabulary in one untagged owner is what lets two features
exchange a report without either importing the other.

Its single interface file is exposed with a wildcard, so every export of that
file is part of the contract and a later addition joins it without a
description change. The exposure carries `browser`, the owner's promise that
the vocabulary and the schema library behind it are browser-safe, which is what
makes the schemas value-importable by the shell and the view modules.
