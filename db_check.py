"""One check for the store book. Fails if a merchant cannot round-trip a SKU."""

import db

assert db.make_engine("postgresql://u:p@localhost/x").dialect.driver == "psycopg2"

def main():
    local_args, local_pool = db.engine_settings("postgresql://postgres:password@localhost:5432/mercura_ai_db")
    remote_args, remote_pool = db.engine_settings("postgresql://postgres:secret@db.example.com:5432/mercura_ai_db")
    pooler_args, pooler = db.engine_settings("postgresql://postgres:secret@aws-0.pooler.supabase.com:6543/postgres")
    assert local_args == {} and local_pool is False
    assert remote_args["sslmode"] == "require" and remote_pool is False
    assert pooler_args["sslmode"] == "require" and pooler is True
    db.init_db()
    stamp = "dbcheck-%s@store.test" % __import__("time").time()
    created = db.register({
        "email": stamp, "password": "secret1", "name": "Anusha K",
        "shop": "Check Threads", "phone": "+919820144821", "category": "Apparel",
    })
    uid = created["merchant"]["uid"]
    assert db.read_token(created["token"])
    sku = {
        "id": "SH-102", "name": "Sports Running Shoes", "cat": "Footwear",
        "supplier": "Apex Footwear Ltd.", "phone": "+91 98201 44821",
        "email": "contact@apexshoes.in", "units": 14, "cost": 1100, "price": 2499,
        "vel": 8.4, "sold": 14, "age": 8, "lead": 7, "loss": 18400, "moq": 1,
        "channels": {"shopify": 8, "pos": 6, "warehouse": 0}, "img": "img/shoes.jpg",
    }
    sale = {"id": "SALE-1", "sku": "SH-102", "name": sku["name"], "qty": 1, "revenue": 2499, "profit": 1399, "timestamp": 1000}
    order = {"id": "PO-1048", "sku": "SH-102", "name": sku["name"], "qty": 12, "status": "sent", "at": 2000}
    book = db.replace_book(uid, {"skus": [sku], "sales": [sale], "orders": [order], "purchases": []})
    got = book["skus"][0]
    assert got["id"] == "SH-102" and got["units"] == 14 and got["loss"] == 18400, got
    assert got["channels"]["shopify"] == 8
    assert book["sales"][0]["qty"] == 1
    assert book["orders"][0]["id"] == "PO-1048" and book["orders"][0]["status"] == "sent"
    again = db.replace_book(uid, {"skus": [sku], "sales": [sale], "orders": [order], "purchases": []})
    assert len(again["sales"]) == 1
    other = db.register({
        "email": "other-" + stamp, "password": "secret1", "name": "Other",
        "shop": "Other", "phone": "+919800000000", "category": "Grocery",
    })
    assert db.load_book(other["merchant"]["uid"])["skus"] == []
    try:
        db.login({"email": stamp, "password": "nope"})
        raise SystemExit("bad password was accepted")
    except ValueError as err:
        assert str(err) == "invalid-credential"
    back = db.login({"email": stamp, "password": "secret1"})
    assert back["merchant"]["shop"] == "Check Threads"
    second = db.login({"email": stamp, "password": "secret1"})
    assert db.read_token(back["token"]) == db.uuid.UUID(uid)
    db.logout(back["token"])
    assert db.read_token(back["token"]) is None, "logged-out session still works"
    assert db.read_token(second["token"]) == db.uuid.UUID(uid), "logout ended the other session"
    assert db.read_token("not-a-token") is None
    assert db.database_host("postgresql://u:a%40b.@h.example.com:5432/x") == "h.example.com"
    with db.session_scope() as session:
        row = session.query(db.AuditLog).filter(db.AuditLog.merchant_id == db.uuid.UUID(uid), db.AuditLog.entity_type == "sku").first()
        expect = db.checksum(row.action, row.entity_type, row.entity_id, row.before_state, row.after_state)
        assert row.checksum == expect
        alerts = session.query(db.StockAlert).filter(db.StockAlert.merchant_id == db.uuid.UUID(uid)).all()
        assert any(item.alert_type == "CRITICAL" for item in alerts), [item.alert_type for item in alerts]
        session.query(db.AuditLog).filter(db.AuditLog.merchant_id.in_([db.uuid.UUID(uid), db.uuid.UUID(other["merchant"]["uid"])])).delete(synchronize_session=False)
        session.query(db.Merchant).filter(db.Merchant.id.in_([db.uuid.UUID(uid), db.uuid.UUID(other["merchant"]["uid"])])).delete(synchronize_session=False)
    print("ok")

if __name__ == "__main__":
    main()
