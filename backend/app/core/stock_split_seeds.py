from datetime import datetime

# Well-known stock splits for common tickers.
# Add new entries here — they will be seeded automatically on first startup.
# Format: ticker, split_date, numerator (new shares), denominator (old shares)
# e.g. 20:1 means 20 new shares for every 1 old share held.

SEED_SPLITS = [
    # Amazon
    {"ticker": "AMZN", "split_date": datetime(2022, 6, 6),  "numerator": 20, "denominator": 1},
    {"ticker": "AMZN", "split_date": datetime(1999, 9, 2),  "numerator": 2,  "denominator": 1},
    {"ticker": "AMZN", "split_date": datetime(1999, 1, 5),  "numerator": 3,  "denominator": 1},
    {"ticker": "AMZN", "split_date": datetime(1998, 6, 2),  "numerator": 2,  "denominator": 1},

    # Apple
    {"ticker": "AAPL", "split_date": datetime(2020, 8, 31), "numerator": 4,  "denominator": 1},
    {"ticker": "AAPL", "split_date": datetime(2014, 6, 9),  "numerator": 7,  "denominator": 1},
    {"ticker": "AAPL", "split_date": datetime(2005, 2, 28), "numerator": 2,  "denominator": 1},
    {"ticker": "AAPL", "split_date": datetime(2000, 6, 21), "numerator": 2,  "denominator": 1},

    # Tesla
    {"ticker": "TSLA", "split_date": datetime(2022, 8, 25), "numerator": 3,  "denominator": 1},
    {"ticker": "TSLA", "split_date": datetime(2020, 8, 31), "numerator": 5,  "denominator": 1},

    # Alphabet / Google
    {"ticker": "GOOGL", "split_date": datetime(2022, 7, 18), "numerator": 20, "denominator": 1},
    {"ticker": "GOOG",  "split_date": datetime(2022, 7, 18), "numerator": 20, "denominator": 1},
    {"ticker": "GOOGL", "split_date": datetime(2014, 4, 3),  "numerator": 2,  "denominator": 1},
    {"ticker": "GOOG",  "split_date": datetime(2014, 4, 3),  "numerator": 2,  "denominator": 1},

    # NVIDIA
    {"ticker": "NVDA", "split_date": datetime(2024, 6, 10), "numerator": 10, "denominator": 1},
    {"ticker": "NVDA", "split_date": datetime(2021, 7, 20), "numerator": 4,  "denominator": 1},
    {"ticker": "NVDA", "split_date": datetime(2007, 9, 11), "numerator": 3,  "denominator": 2},
    {"ticker": "NVDA", "split_date": datetime(2006, 4, 7),  "numerator": 2,  "denominator": 1},

    # Microsoft
    {"ticker": "MSFT", "split_date": datetime(2003, 2, 18), "numerator": 2,  "denominator": 1},

    # Meta (Facebook)
    # No splits yet

    # Netflix
    {"ticker": "NFLX", "split_date": datetime(2025, 11, 17), "numerator": 10, "denominator": 1},
    {"ticker": "NFLX", "split_date": datetime(2015, 7, 15),  "numerator": 7,  "denominator": 1},
    {"ticker": "NFLX", "split_date": datetime(2004, 2, 12),  "numerator": 2,  "denominator": 1},

    # Shopify
    {"ticker": "SHOP", "split_date": datetime(2022, 6, 29), "numerator": 10, "denominator": 1},
]
