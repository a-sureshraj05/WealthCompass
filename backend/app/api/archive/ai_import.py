import os
import traceback

import vertexai
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from vertexai.generative_models import GenerativeModel, Tool

# No explicit load_dotenv() call is needed here, as it's handled in main.py.
# vertexai.init will automatically pick up project and location from environment variables
# when GOOGLE_GENAI_USE_VERTEXAI is true.

vertexai.init()

router = APIRouter()


class StatementRequest(BaseModel):
    text: str
    brokerageName: str


# Define the function declaration for the tool
parse_portfolio_func = {
    "name": "parse_portfolio",
    "description": "Parses a brokerage statement and returns a list of stock holdings.",
    "parameters": {
        "type": "object",
        "properties": {
            "holdings": {
                "type": "array",
                "description": "A list of stock holdings.",
                "items": {
                    "type": "object",
                    "properties": {
                        "ticker": {
                            "type": "string",
                            "description": "Stock symbol (e.g. AAPL)",
                        },
                        "name": {"type": "string", "description": "Full company name"},
                        "quantity": {
                            "type": "number",
                            "description": "Number of shares held",
                        },
                        "avgPrice": {
                            "type": "number",
                            "description": "Average purchase price per share",
                        },
                        "currentPrice": {
                            "type": "number",
                            "description": "Current market price mentioned in statement",
                        },
                        "category": {
                            "type": "string",
                            "description": "Sector or category (e.g. Technology, Health)",
                        },
                    },
                    "required": [
                        "ticker",
                        "name",
                        "quantity",
                        "avgPrice",
                        "currentPrice",
                        "category",
                    ],
                },
            },
        },
        "required": ["holdings"],
    },
}


@router.post("/api/ai/parse-statement")
def parse_statement(request: StatementRequest):
    try:
        model = GenerativeModel(os.getenv("GEMINI_MODEL", "gemini-1.5-flash-001"))
        tool = Tool.from_dict({"function_declarations": [parse_portfolio_func]})

        response = model.generate_content(
            f"Extract all stock and ETF holdings from the following brokerage statement and call the `parse_portfolio` function with the results. Brokerage: {request.brokerageName}. Statement text: {request.text}",
            tools=[tool],
        )

        if not response.candidates:
            print("No candidates returned from model. Full response:", response)
            raise HTTPException(
                status_code=500,
                detail="The AI model did not return a response. This may be due to safety filters.",
            )

        if not response.candidates[0].content.parts:
            print("Model returned a candidate with no parts. Full response:", response)
            raise HTTPException(
                status_code=500,
                detail="The AI model returned an empty response part. It may not have understood the request.",
            )

        part = response.candidates[0].content.parts[0]
        function_call = part.function_call

        if function_call.name != "parse_portfolio":
            raise ValueError("Unexpected function call from model")

        holdings = [dict(item) for item in function_call.args["holdings"]]

        return holdings

    except Exception as e:
        print(f"Error calling Vertex AI: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"Error processing statement with AI: {str(e)}"
        )
