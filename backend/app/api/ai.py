from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import vertexai
from vertexai.generative_models import GenerativeModel, Tool, Part, FunctionCall
import os
import json
import traceback
import csv
from io import StringIO

# No explicit load_dotenv() call is needed here, as it's handled in main.py.
# vertexai.init will automatically pick up project and location from environment variables
# when GOOGLE_GENAI_USE_VERTEXAI is true.

vertexai.init()

router = APIRouter()

class StatementRequest(BaseModel):
    text: str
    brokerageName: str

def _parse_csv_to_structured_text(csv_text: str) -> str:
    """
    Parses CSV text and converts it into a structured text format for the AI model.
    Handles embedded newlines within CSV fields.
    """
    output_lines = []
    f = StringIO(csv_text)
    reader = csv.reader(f)

    header = []
    try:
        header = next(reader) # Read header
    except StopIteration:
        return "Empty CSV data provided."
    
    # Clean header: remove BOM if present and strip whitespace
    header = [col.strip().lstrip('\ufeff') for col in header]

    # Process data rows
    for i, row in enumerate(reader):
        # Skip empty rows or rows with disclaimers (heuristics: check for non-empty header-like first element, or 'The data provided is for informational purposes only')
        if not row or all(not cell.strip() for cell in row) or "The data provided is for informational purposes only" in row[0]:
            continue # Skip empty or disclaimer rows

        # Ensure row has enough columns to match header length
        if len(row) != len(header):
            # This can happen if there are trailing empty columns or malformed rows
            # For now, we'll try to join what we can. More robust error handling needed for production
            print(f"Warning: Row {i+2} has {len(row)} columns, expected {len(header)}. Skipping or incomplete parsing.\nRow: {row}")
            # Attempt to pad or truncate if it's consistently a small mismatch
            if len(row) < len(header):
                row.extend([''] * (len(header) - len(row)))
            elif len(row) > len(header):
                row = row[:len(header)]

        row_data = {header[j]: cell.strip() for j, cell in enumerate(row) if j < len(header) and header[j]}
        output_lines.append(json.dumps(row_data))
    
    if not output_lines:
        return "No valid transaction data found in CSV after parsing."

    return "\n".join(output_lines)


# Define the function declaration for the tool (still needed for schema reference)
parse_transactions_func = {
    "name": "parse_transactions",
    "description": "Parses a brokerage statement in CSV format and returns a list of individual transactions.",
    "parameters": {
        "type": "object",
        "properties": {
            "transactions": {
                "type": "array",
                "description": "A list of brokerage transactions.",
                "items": {
                    "type": "object",
                    "properties": {
                        "activityDate": {"type": "string", "description": "The date of the activity (e.g., 1/31/2025)"},
                        "ticker": {"type": "string", "description": "Stock symbol or ETF ticker (e.g. CHPT, INTC) found under the 'Instrument' column."},
                        "description": {"type": "string", "description": "Full description of the transaction as seen in the statement."},
                        "action": {"type": "string", "description": "Type of transaction (e.g. Buy, Sell, STC, BTO) found under the 'Trans Code' column."},
                        "quantity": {"type": "number", "description": "Number of shares or units involved in the transaction."},
                        "price": {"type": "string", "description": "Price per share or unit, including currency symbol (e.g. $0.35)."},
                        "amount": {"type": "string", "description": "Total amount of the transaction, including currency symbol and parentheses for negative (e.g. ($5,177.50))."}
                    },
                    "required": ["activityDate", "ticker", "description", "action", "quantity", "price", "amount"],
                },
            },
        },
        "required": ["transactions"],
    },
}

@router.post("/api/ai/parse-statement")
def parse_statement(request: StatementRequest):
    try:
        # Pre-process the raw CSV text
        structured_text = _parse_csv_to_structured_text(request.text)
        if structured_text == "Empty CSV data provided." or structured_text == "No valid transaction data found in CSV after parsing.":
            raise HTTPException(status_code=400, detail=structured_text)

        model = GenerativeModel(os.getenv("GEMINI_MODEL", "gemini-1.5-flash-001"))
        # Tool is NOT passed to generate_content, as we expect raw JSON output
        
        response = model.generate_content(
            f"The following text is a brokerage statement from {request.brokerageName}. Each line is a JSON object representing a transaction. Your task is to extract all individual transactions from this data. Respond *only* with a JSON object where the key is \"transactions\" and the value is a JSON array of the extracted transaction objects. Each transaction object should have the following keys: activityDate, ticker, description, action, quantity (as a number), price (as a string including currency), and amount (as a string including currency and signs). Structured transaction data: {structured_text}"
        )

        if not response.candidates:
            print("No candidates returned from model. Full response:", response)
            raise HTTPException(status_code=500, detail="The AI model did not return a response. This may be due to safety filters.")

        # Expecting text output from the model now
        model_output_text = response.candidates[0].content.text
        print("Raw Model Output Text:", model_output_text)

        # Strip markdown code block fences if present
        if model_output_text.strip().startswith("```json") and model_output_text.strip().endswith("```"):
            model_output_text = model_output_text.strip()[len("```json\n"): -len("```")].strip()

        # Strip markdown code block fences if present
        if model_output_text.strip().startswith("```json") and model_output_text.strip().endswith("```"):
            model_output_text = model_output_text.strip()[len("```json\n"): -len("```")].strip()
        
        try:
            # Parse the model's text output as JSON
            parsed_data = json.loads(model_output_text)
        except json.JSONDecodeError as e:
            print(f"JSON Decode Error from model output: {e}. Raw output: {model_output_text}")
            raise HTTPException(status_code=500, detail=f"AI model returned malformed JSON: {e}")

        # Validate the parsed data against our expected structure (transactions array)
        if "transactions" not in parsed_data or not isinstance(parsed_data["transactions"], list):
            print("Model output did not contain a 'transactions' list as expected. Parsed data:", parsed_data)
            raise HTTPException(status_code=500, detail="AI model output missing 'transactions' list.")

        transactions = parsed_data["transactions"]
        
        # Optional: Further validate individual transaction items against the schema if needed
        # For now, we trust the model to follow instructions given strong prompt

        return transactions

    except Exception as e:
        print(f"Error processing statement with AI: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing statement with AI: {str(e)}")