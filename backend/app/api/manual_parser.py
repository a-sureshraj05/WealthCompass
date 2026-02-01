from typing import List, Dict, Any

def parse_statement_manually(text: str, brokerage_name: str) -> List[Dict[str, Any]]:
    """
    Parses a brokerage statement manually (without AI) to extract stock holdings.
    This is a placeholder function. Actual parsing logic needs to be implemented.

    Args:
        text: The full text of the brokerage statement.
        brokerage_name: The name of the brokerage.

    Returns:
        A list of dictionaries, where each dictionary represents a stock holding
        and matches the structure expected by the parse_portfolio_func.
        Example:
        [
            {
                "ticker": "AAPL",
                "name": "Apple Inc.",
                "quantity": 10,
                "avgPrice": 150.00,
                "currentPrice": 170.00,
                "category": "Technology"
            }
        ]
    """
    print(f"Manual parsing requested for brokerage: {brokerage_name} with text: {text[:100]}...")
    # Placeholder for manual parsing logic
    # In a real scenario, you would implement regex, keyword matching, or other
    # rule-based parsing here based on the brokerage_name and statement text format.

    # Returning mock data for demonstration
    if "example holdings" in text.lower() or brokerage_name.lower() == "mock":
        return [
            {
                "ticker": "MSFT",
                "name": "Microsoft Corp",
                "quantity": 5,
                "avgPrice": 250.00,
                "currentPrice": 280.00,
                "category": "Technology"
            },
            {
                "ticker": "GOOG",
                "name": "Alphabet Inc.",
                "quantity": 2,
                "avgPrice": 120.00,
                "currentPrice": 130.00,
                "category": "Technology"
            }
        ]
    else:
        return []

