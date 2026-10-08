# Catalog Core

Catalog Core holds the two fixed records and the operations over them: reading
a record's summary and inspecting its revision chain into a neutral report of
facts. The report says which predecessor references resolved and which did not;
turning an unresolved reference into a finding is validation's job, not this
module's.

Its internals are ordinary functions and one private history helper that no
other owner can reach. The summary type it returns is exposed to its adapter
parent along with the behaviour that produces it.
