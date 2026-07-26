# Crypto Watchlist Alerts — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A personal Telegram bot that lets users maintain a private crypto watchlist and receive alerts when coins cross price thresholds or move by a percentage over a time window. Features include on-demand price checks, optional scheduled morning summaries, quiet hours, typo handling, and owner analytics.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Individual crypto watchers

## Success criteria

- Users can add and manage coins in their watchlist
- Users receive accurate alerts when price thresholds are crossed or percentage changes occur
- Users can customize quiet hours and morning summary settings
- Owner receives aggregate analytics without exposing private user data

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu
- **Add coin** (button, actor: user, callback: add_coin:start) — Begin adding a new coin to the watchlist
  - inputs: coin selection, confirmation for unknown tickers
  - outputs: updated watchlist, confirmation message
- **View list** (button, actor: user, callback: view_list:show) — Display current watchlist with prices
  - inputs: none
  - outputs: watchlist with prices
- **Set quiet hours** (button, actor: user, callback: quiet_hours:start) — Configure quiet hours for alert suppression
  - inputs: start time, end time
  - outputs: updated quiet hours settings
- **Morning summary** (button, actor: user, callback: morning_summary:start) — Configure morning summary preferences
  - inputs: local time for summary
  - outputs: updated morning summary settings
- **/price** (command, actor: user, command: /price) — Check current price for a specific coin or all watchlist coins
  - inputs: ticker symbol or 'all'
  - outputs: price information with 1h/24h changes
- **Create alert** (button, actor: user, callback: create_alert:start) — Set up a new price alert rule
  - inputs: coin selection, alert type, threshold/percent value
  - outputs: new alert rule created

## Flows

### Add coin flow
_Trigger:_ add_coin:start

1. Show inline buttons for common coins (BTC, ETH, TON)
2. Accept free-text ticker input
3. Check if ticker is valid
4. If invalid, show closest matches and confirm/cancel flow
5. Add coin to watchlist

_Data touched:_ User profile

### Create alert flow
_Trigger:_ create_alert:start

1. Select coin from watchlist
2. Choose alert type (threshold or percent)
3. Enter value (price or percent)
4. Confirm alert creation
5. Store alert rule

_Data touched:_ Alert rule

### Price check flow
_Trigger:_ /price

1. Parse ticker parameter
2. Fetch current price and changes
3. Format and display price information

_Data touched:_ Coin/ticker

### Alert processing flow
_Trigger:_ price update event

1. Check all active alert rules
2. Calculate price changes
3. Trigger alerts if conditions met
4. Apply quiet hours suppression
5. Enforce 24h cooldown

_Data touched:_ Alert rule, Coin/ticker

### Morning summary flow
_Trigger:_ scheduled time

1. Fetch current prices for all watchlist coins
2. Identify notable moves
3. Format summary message
4. Send to user if enabled

_Data touched:_ User profile, Coin/ticker

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User profile** _(retention: persistent)_ — User-specific settings and watchlist data
  - fields: watchlist, alert rules, quiet hours, morning-summary time, cooldown state
- **Coin/ticker** _(retention: persistent)_ — Cryptocurrency information and price data
  - fields: symbol, display name, last-known price, last-alert timestamps per rule
- **Alert rule** _(retention: persistent)_ — User-defined price alert conditions
  - fields: type, parameters, enabled/disabled

## Integrations

- **Telegram** (required) — Bot API messaging
- **Price feed** (required) — Market price data
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Receive weekly and on-demand aggregate analytics (active users, top 10 alert rules)

## Notifications

- Price alerts to users
- Morning summaries to users
- Aggregate analytics to owner

## Permissions & privacy

- All user data is private and not shared with third parties
- Owner only sees aggregated metrics, not individual user data

## Edge cases

- Price feed failures are retried silently without user alerts
- Unknown tickers are handled with suggestions and confirmation
- Quiet hours suppress alerts but queue them for later delivery

## Required tests

- Verify alert rules trigger correctly with price changes
- Test quiet hours suppression and alert queuing
- Validate morning summary content and scheduling
- Confirm typo handling and unknown ticker suggestions

## Assumptions

- Price values and thresholds are in USD by default
- Percent moves use a 1-hour window
- 24-hour cooldown applies per coin+rule
- Morning summaries are optional and limited to watchlist content
