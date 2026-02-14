from typing import Any, Callable, Dict, List  # noqa: F401

# Define the default expected attributes for a stock holding
DEFAULT_TRANSACTION_SCHEMA = {
    "brokerage": str,
    "date": str,
    "ticker": str,
    "name": str,
    "action": str,
    "quantity": float,
    "costPerShare": float,
    "totalCost": float,
    "assetType": str,
}

def get_asset_type(row_data: Dict[str, Any], config: Dict[str, Any]) -> str:
    action_key = next((key for key, value in config["csv_to_holding_map"].items() if value == "action"), None)
    if action_key:
        action = row_data.get(action_key, "").lower()
        if action in ["buy", "sell", "conv"]:
            return "Equity"
        elif action in ["bto", "stc"]:
            return "Options"
    return ""

BROKERAGE_CONFIGS = {
    "Robinhood": {
        "csv_columns": [
            "Activity Date",
            "Process Date",
            "Settle Date",
            "Instrument",
            "Description",
            "Trans Code",
            "Quantity",
            "Price",
            "Amount",
        ],
        "csv_to_holding_map": {
            "Settle Date": "date",
            "Instrument": "ticker",
            "Description": "name",
            "Trans Code": "action",
            "Quantity": "quantity",
            "Price": "costPerShare",
            "Amount": "totalCost",
        },
        "derived_attributes": {
            "brokerage": lambda row_data, config: "Robinhood",
            "assetType": get_asset_type,
        },
        "csv_delimiter": ",",
        "header_row_index": 0,
        "date_format": "%m/%d/%Y",  # Updated date format
    },
    "Schwab": {
        "csv_columns": [
            "Date",
            "Action",
            "Symbol",
            "Description",
            "Quantity",
            "Price",
            "Commissions & Fees",
            "Amount",
            "Settlement Date",
        ],
        "csv_to_holding_map": {
            "Date": "date",
            "Symbol": "ticker",
            "Description": "name",
            "Action": "action",
            "Quantity": "quantity",
            "Price": "costPerShare",
            "Amount": "totalCost",
        },
        "derived_attributes": {
            "brokerage": lambda row_data, config: "Schwab",
            "assetType": get_asset_type,
        },
        "csv_delimiter": ",",
        "header_row_index": 0,
        "date_format": "%Y-%m-%d",  # Example date format
    },
    "ExampleBrokerage": {
        "csv_columns": [
            "Trade Date",
            "Settlement Date",
            "Action",
            "Symbol",
            "Description",
            "Quantity",
            "Price",
            "Commission",
            "Amount",
            "Account Type",
        ],
        "csv_to_holding_map": {
            "Trade Date": "date",
            "Symbol": "ticker",
            "Description": "name",
            "Action": "action",
            "Quantity": "quantity",
            "Price": "costPerShare",
            "Amount": "totalCost",  # Assuming Amount is total cost
        },
        "derived_attributes": {
            "brokerage": lambda row_data, config: "ExampleBrokerage",
            "assetType": get_asset_type,
        },
        "csv_delimiter": ",",
        "header_row_index": 0,
        "date_format": "%Y-%m-%d",  # Example date format
    },
}
