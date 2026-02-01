#!/bin/bash

# Define the API endpoint
API_URL="http://localhost:8000/api/manual/parse-statement"

# Define the brokerage name (can be made an argument later if needed)
BROKERAGE_NAME="Robinhood"

# Check if an argument is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <path_to_input_csv_file>"
    exit 1
fi

INPUT_CSV_FILE="$1"

# Read the CSV data from the file
# Check if the file exists
if [ ! -f "$INPUT_CSV_FILE" ]; then
    echo "Error: Input CSV file '$INPUT_CSV_FILE' not found."
    exit 1
fi

CSV_DATA=$(cat "$INPUT_CSV_FILE")

# Escape the CSV_DATA for JSON and store it in a variable
ESCAPED_CSV_DATA=$(printf %s "$CSV_DATA" | jq -Rs .)

# Construct the JSON payload
# Note: ESCAPED_CSV_DATA already includes quotes from jq -Rs .
JSON_PAYLOAD=$(cat <<EOF
{
  "text": $ESCAPED_CSV_DATA,
  "brokerageName": "$BROKERAGE_NAME"
}
EOF
)

echo "Sending request to: $API_URL"
echo "Payload:"
echo "$JSON_PAYLOAD" | jq . # Pretty print JSON if jq is available

# Send the POST request using curl
curl -X POST "$API_URL" \
     -H "Content-Type: application/json" \
     -d "$JSON_PAYLOAD"

echo "" # Add a newline for cleaner output
