from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.db.schema import Holding
from .manual_parser import parse_statement_manually

router = APIRouter()

class StatementRequest(BaseModel):
    text: str
    brokerageName: str

@router.post("/manual/parse-statement")
def parse_statement_manual_endpoint(request: StatementRequest, db: Session = Depends(get_db)):
    try:
        # Delete existing holdings for this brokerageName
        db.query(Holding).filter(Holding.brokerage == request.brokerageName).delete()
        db.commit()

        parsed_holdings_data = parse_statement_manually(request.text, request.brokerageName)
        
        new_holding_ids = []
        for holding_data in parsed_holdings_data:
            db_holding = Holding(
                brokerage=holding_data["brokerage"],
                date=holding_data["date"],
                ticker=holding_data["ticker"],
                name=holding_data["name"],
                action=holding_data["action"],
                quantity=holding_data["quantity"],
                costPerShare=holding_data["costPerShare"],
                totalCost=holding_data["totalCost"],
            )
            db.add(db_holding)
            db.flush() # Flush to assign ID before commit, if needed by subsequent logic
            new_holding_ids.append(db_holding.id)
        db.commit()

        # After commit, query for the newly added holdings to get their IDs and full data
        # Or, to simplify, fetch all holdings for the given brokerage after the update
        updated_holdings = db.query(Holding).filter(Holding.brokerage == request.brokerageName).all()

        return {"message": "Holdings parsed and saved successfully!", "holdings": updated_holdings}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing statement manually: {str(e)}")
