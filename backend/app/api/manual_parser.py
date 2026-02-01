import io
import csv
from datetime import datetime
from typing import List, Dict, Any, Callable
from backend.app.core.brokerage_configs import BROKERAGE_CONFIGS, DEFAULT_HOLDING_SCHEMA

def parse_statement_manually(text: str, brokerage_name: str) -> List[Dict[str, Any]]:
    """
    Parses a brokerage statement manually (without AI) to extract stock holdings.
    It uses predefined configurations for each brokerage to parse CSV formatted text,
    and maps them to the DEFAULT_HOLDING_SCHEMA.

    Args:
        text: The CSV content of the brokerage statement.
        brokerage_name: The name of the brokerage, used to look up parsing configuration.

    Returns:
        A list of dictionaries, where each dictionary represents a stock holding
        and matches the structure expected by the system.

    Raises:
        ValueError: If the brokerage configuration is not found or parsing fails.
    """
    if brokerage_name not in BROKERAGE_CONFIGS:
        raise ValueError(f"Configuration for brokerage '{brokerage_name}' not found.")

    config = BROKERAGE_CONFIGS[brokerage_name]
    delimiter = config.get("csv_delimiter", ",")
    header_row_index = config.get("header_row_index", 0)
    csv_to_holding_map = config.get("csv_to_holding_map", {})
    derived_attributes = config.get("derived_attributes", {})
    date_format = config.get("date_format", "%Y-%m-%d")

    holdings = []
    csv_file = io.StringIO(text)
    reader = csv.reader(csv_file, delimiter=delimiter)

    headers = []
    for i, row in enumerate(reader):
        if i == header_row_index:
            headers = [h.strip() for h in row]
            break

    if not headers:
        raise ValueError("Could not find header row in CSV.")

    # Verify required columns for direct mapping are present in headers
    for csv_col in csv_to_holding_map.keys():
        if csv_col not in headers:
            raise ValueError(f"Required CSV column '{csv_col}' not found in statement headers for direct mapping.")

    for row in reader: # Continue reading from after the header
        if not row:
            continue # Skip empty rows

        row_data = dict(zip(headers, row))

        # Initialize holding based on DEFAULT_HOLDING_SCHEMA
        holding = {}
        for attr, attr_type in DEFAULT_HOLDING_SCHEMA.items():
            if attr_type is str:
                holding[attr] = ""
            elif attr_type is float:
                holding[attr] = 0.0
            elif attr_type is datetime:
                holding[attr] = None
            # Add more types if necessary, or use a generic default

        # Apply direct CSV to holding mapping
        for csv_col, target_attr in csv_to_holding_map.items():
            value = row_data.get(csv_col, "")
            
            # Remove newlines from string values
            if isinstance(value, str):
                value = value.replace('\n', ' ').replace('\r', '').strip()

            if target_attr in ["quantity", "costPerShare", "totalCost"]:
                # Handle commas, dollar signs, and parentheses for negative numbers
                cleaned_value = value.replace('$', '').replace(',', '').strip()
                if cleaned_value.startswith('(') and cleaned_value.endswith(')'):
                    # Convert (100.00) to -100.00
                    cleaned_value = '-' + cleaned_value[1:-1]
                
                try:
                    holding[target_attr] = float(cleaned_value) if cleaned_value else 0.0
                except ValueError:
                    print(f"Warning: Could not convert '{cleaned_value}' to float for {target_attr}.")
                    holding[target_attr] = 0.0
            elif target_attr == "date":
                try:
                    holding[target_attr] = datetime.strptime(str(value), date_format).date()
                except (ValueError, TypeError):
                    print(f"Warning: Could not convert '{value}' to date using format '{date_format}' for {target_attr}.")
                    holding[target_attr] = None
            elif value is not None:
                holding[target_attr] = value
        
        # Apply derived attributes
        for target_attr, callable_func in derived_attributes.items():
            try:
                # Pass row_data and config to the callable for more context if needed
                derived_value = callable_func(row_data, config)
                # Remove newlines from derived string values
                if isinstance(derived_value, str):
                    derived_value = derived_value.replace('\n', ' ').replace('\r', '').strip()
                holding[target_attr] = derived_value
            except Exception as e:
                print(f"Warning: Error executing derived function for {target_attr}: {e}")
                holding[target_attr] = None # Fallback if derived function fails

        # Basic validation: ensure we have at least a ticker and quantity
        if holding.get("ticker") and holding.get("quantity", 0) > 0:
            holdings.append(holding)

    return holdings
