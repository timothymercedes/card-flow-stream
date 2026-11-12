"""Execute the deployed projection's SELECT against isolated synthetic rows."""
import re
import sqlite3
import unittest
from pathlib import Path


class PublicQueuePermissions(unittest.TestCase):
    def setUp(self):
        sql = (Path(__file__).resolve().parents[2] / "drizzle/migrations/0004_public_upcoming_queue_projection.sql").read_text()
        self.query = re.search(r"AS \$\$(.*?)\$\$", sql, re.S).group(1).replace("public.", "").replace("_stream_id", "?")
        self.db = sqlite3.connect(":memory:")
        self.db.executescript("""
          CREATE TABLE live_streams(id TEXT, is_private INTEGER, status TEXT);
          CREATE TABLE auction_queue(id TEXT, stream_id TEXT, position INTEGER, title TEXT,
            image_url TEXT, description TEXT, starting_bid REAL, visibility TEXT, status TEXT,
            sold_to TEXT, host_id TEXT, order_id TEXT);
          INSERT INTO live_streams VALUES('show',0,'live');
          INSERT INTO auction_queue VALUES('item','show',0,'Published item','photo','Description',12.50,'public','queued',NULL,'private-seller','private-order');
        """)

    def tearDown(self):
        self.db.close()

    def rows(self):
        return self.db.execute(self.query, ("show",)).fetchall()

    def test_published_upcoming_item_has_photo_description_and_exact_starting_price(self):
        self.assertEqual(self.rows(), [('item', 'show', 0, 'Published item', 'photo', 'Description', 12.50)])

    def test_private_items_are_hidden(self):
        self.db.execute("UPDATE auction_queue SET visibility='private'")
        self.assertEqual(self.rows(), [])

    def test_draft_items_are_hidden(self):
        self.db.execute("UPDATE auction_queue SET visibility='draft'")
        self.assertEqual(self.rows(), [])

    def test_unrecognized_publication_state_is_hidden(self):
        self.db.execute("UPDATE auction_queue SET visibility='unpublished'")
        self.assertEqual(self.rows(), [])

    def test_private_shows_are_hidden(self):
        self.db.execute("UPDATE live_streams SET is_private=1")
        self.assertEqual(self.rows(), [])

    def test_draft_shows_are_hidden(self):
        self.db.execute("UPDATE live_streams SET status='draft'")
        self.assertEqual(self.rows(), [])

    def test_non_upcoming_items_are_hidden(self):
        self.db.execute("UPDATE auction_queue SET status='running'")
        self.assertEqual(self.rows(), [])

    def test_sold_items_are_hidden(self):
        self.db.execute("UPDATE auction_queue SET sold_to='buyer'")
        self.assertEqual(self.rows(), [])

    def test_no_private_seller_or_order_fields(self):
        cursor = self.db.execute(self.query, ('show',))
        self.assertEqual([column[0] for column in cursor.description], ['id', 'stream_id', 'position', 'title', 'image_url', 'description', 'starting_bid'])


if __name__ == '__main__':
    unittest.main()