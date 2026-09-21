# Catalog UI

Catalog UI renders one record as a card. It is a pure view: it is handed a
summary and renders it, with no fetching of its own and no protocol type in its
internals.

The summary type it renders reaches it from its core sibling by way of their
common parent, which relays that type downward, and upward beside the card and
its props, whose signature names it. The card also renders the
shared status badge it receives from the workspace.
