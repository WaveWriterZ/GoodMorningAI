# Identity Service

The Identity Service is responsible for issuing and validating Mission Systems Identifiers (MSIDs).

Every object created within GoodMorningAI receives one permanent MSID.

Responsibilities:

- Generate MSIDs
- Validate MSIDs
- Prevent duplicates
- Register new objects
- Resolve object identity
- Track identifier history

The Identity Service is the first Mission Service because every other service depends upon identity.
