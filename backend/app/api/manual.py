from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.db.schema import Holding, Transaction as DBTransaction # Import Transaction as DBTransaction
from .manual_parser import parse_statement_manually
from . import process

router = APIRouter()

class StatementRequest(BaseModel):
    text: str
    brokerageName: str

@router.post("/manual/parse-statement")
def parse_statement_manual_endpoint(request: StatementRequest, db: Session = Depends(get_db)):
    try:
        # Delete existing transactions for this brokerageName
        db.query(DBTransaction).filter(DBTransaction.brokerage == request.brokerageName).delete()
        db.commit()

        parsed_transactions_data = parse_statement_manually(request.text, request.brokerageName)
        
        new_transaction_ids = []
        for transaction_data in parsed_transactions_data:
            db_transaction = DBTransaction(
                brokerage=transaction_data["brokerage"],
                date=transaction_data["date"],
                ticker=transaction_data["ticker"],
                name=transaction_data["name"],
                action=transaction_data["action"],
                quantity=transaction_data["quantity"],
                price=transaction_data["costPerShare"], # Map costPerShare from parser to price in Transaction
                costPerShare=transaction_data["costPerShare"],
                totalCost=transaction_data["totalCost"],
            )
            db.add(db_transaction)
            db.flush() # Flush to assign ID before commit, if needed by subsequent logic
            new_transaction_ids.append(db_transaction.id)
        db.commit()

        process.process_transactions(db, request.brokerageName) # Call the new processing function with db session and brokerage name

        # After commit, query for the newly added transactions to get their IDs and full data
        # Or, to simplify, fetch all transactions for the given brokerage after the update
        updated_transactions = db.query(DBTransaction).filter(DBTransaction.brokerage == request.brokerageName).all()

        return {"message": "Transactions parsed and saved successfully!", "transactions": updated_transactions}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing statement manually: {str(e)}")
