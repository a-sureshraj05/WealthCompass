from typing import List, Dict, Any, Callable

# Define the default expected attributes for a stock holding
DEFAULT_HOLDING_SCHEMA = {
    "brokerage": str,
    "date": str,
    "ticker": str,
    "name": str,
    "action": str,
    "quantity": float,
    "costPerShare": float,
    "totalCost": float,
}

BROKERAGE_CONFIGS = {
    "Robinhood": {
        "csv_columns": [
            "Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
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
        },
        "csv_delimiter": ",",
        "header_row_index": 0,
        "date_format": "%m/%d/%Y", # Updated date format
    },
    "Schwab": {
        "csv_columns": [
            "Date", "Action", "Symbol", "Description", "Quantity",
            "Price", "Commissions & Fees", "Amount", "Settlement Date"
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
        },
        "csv_delimiter": ",",
        "header_row_index": 0,
        "date_format": "%Y-%m-%d", # Example date format
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
            "Account Type"
        ],
        "csv_to_holding_map": {
            "Trade Date": "date",
            "Symbol": "ticker",
            "Description": "name",
            "Action": "action",
            "Quantity": "quantity",
            "Price": "costPerShare", 
            "Amount": "totalCost", # Assuming Amount is total cost
        },
        "derived_attributes": {
            "brokerage": lambda row_data, config: "ExampleBrokerage",
        },
        "csv_delimiter": ",",
        "header_row_index": 0, 
        "date_format": "%Y-%m-%d", # Example date format
    }
}
