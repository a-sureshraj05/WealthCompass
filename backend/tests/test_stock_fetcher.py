import unittest
from unittest.mock import patch, MagicMock
import pandas as pd
from backend.app.core.stock_fetcher import get_stock_price, get_stock_price_by_date_range

class TestStockFetcher(unittest.TestCase):

    @patch('yfinance.Ticker')
    def test_get_stock_price_success(self, mock_ticker):
        """Test successful retrieval of a stock price."""
        mock_instance = MagicMock()
        # Create a mock DataFrame for the history call
        mock_df = pd.DataFrame({'Close': [150.0]})
        mock_instance.history.return_value = mock_df
        mock_ticker.return_value = mock_instance

        data = get_stock_price('AAPL')
        self.assertIsNotNone(data)
        self.assertIsInstance(data, pd.DataFrame)
        self.assertEqual(data['Close'].iloc[0], 150.0)
        mock_ticker.assert_called_with('AAPL')
        mock_instance.history.assert_called_with(period='1d')

    @patch('yfinance.Ticker')
    def test_get_stock_price_custom_period(self, mock_ticker):
        """Test successful retrieval of a stock price for a custom period."""
        mock_instance = MagicMock()
        # Create a mock DataFrame for the history call
        mock_df = pd.DataFrame({'Close': [150.0, 152.0, 151.0, 153.0, 155.0]})
        mock_instance.history.return_value = mock_df
        mock_ticker.return_value = mock_instance

        data = get_stock_price('AAPL', period='5d')
        self.assertIsNotNone(data)
        self.assertIsInstance(data, pd.DataFrame)
        self.assertEqual(len(data), 5)
        mock_ticker.assert_called_with('AAPL')
        mock_instance.history.assert_called_with(period='5d')

    @patch('yfinance.Ticker')
    def test_get_stock_price_empty_history(self, mock_ticker):
        """Test fallback mechanism when history is empty."""
        mock_instance = MagicMock()
        mock_instance.history.return_value = pd.DataFrame()
        mock_ticker.return_value = mock_instance

        data = get_stock_price('AAPL')
        self.assertIsNone(data)

    @patch('yfinance.Ticker')
    def test_get_stock_price_api_error(self, mock_ticker):
        """Test handling of an exception from the yfinance API."""
        mock_ticker.side_effect = Exception("API Error")

        price = get_stock_price('GOOG')
        self.assertIsNone(price)

    @patch('yfinance.download')
    def test_get_stock_price_by_date_range(self, mock_download):
        """Test successful retrieval of stock data for a date range."""
        mock_df = pd.DataFrame({'Close': [160.0, 162.0, 161.0]})
        mock_download.return_value = mock_df

        data = get_stock_price_by_date_range('AAPL', '2023-01-01', '2023-01-03')
        self.assertIsNotNone(data)
        self.assertIsInstance(data, pd.DataFrame)
        self.assertEqual(len(data), 3)
        mock_download.assert_called_with('AAPL', start='2023-01-01', end='2023-01-03')

if __name__ == '__main__':
    unittest.main()
