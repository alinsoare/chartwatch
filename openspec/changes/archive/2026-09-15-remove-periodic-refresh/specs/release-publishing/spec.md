## MODIFIED Requirements

### Requirement: The published site is a passive snapshot

The published GitHub Pages site SHALL make no requests to the market data source and SHALL offer no sync capability. It SHALL display when its data snapshot was generated so the user knows how fresh it is.

#### Scenario: Browsing the published site

- **WHEN** a user browses charts and toggles indicators on the Pages site
- **THEN** the only network requests are for the site's own static assets and data files, and the snapshot timestamp is visible

#### Scenario: No refresh control on the published site

- **WHEN** a user looks for a way to update the data on the Pages site
- **THEN** no sync control is present, and the snapshot timestamp is the only indication of data age
