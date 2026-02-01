# Brokerage Parsing Configuration

This file defines configurations for parsing various brokerage statements.
Each brokerage should have its own section.

## Robinhood

### Prompt Enhancements
The following text is a brokerage statement from {brokerageName}. Each line in the provided 'Structured transaction data' is a JSON object representing a transaction. Your task is to extract all individual transactions from this data.

### Column Mappings (CSV Header -> Target Name)
- "Activity Date" -> "activityDate"
- "Instrument" -> "ticker"
- "Description" -> "description"
- "Trans Code" -> "action"
- "Quantity" -> "quantity"
- "Price" -> "price"
- "Amount" -> "amount"
