"""PostgreSQL store book for Mercura. The browser asks server.py; this file is the database."""

import hashlib
import hmac
import json
import math
import os
import secrets
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import (
    Boolean, DateTime, ForeignKeyConstraint, Integer, Numeric, String, Text,
    Uuid, BigInteger, delete, select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def load_env():
    path = os.path.join(BASE_DIR, ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()

DATABASE_URL = os.environ.get("DATABASE_URL", "")
SESSION_DAYS = 30
LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")


def database_host(url):
    try:
        return make_url(url).host or ""
    except Exception:
        return ""


def remote_database(url):
    return bool(url) and database_host(url) not in LOCAL_HOSTS


def engine_settings(url):
    args = {}
    if remote_database(url) and "sslmode=" not in url:
        args["sslmode"] = "require"
    pooled = ":6543" in url or ("pooler.supabase.com" in url and ":5432" not in url)
    return args, pooled


def make_engine(url):
    if not url:
        return None
    # ponytail: Supabase's transaction pooler (port 6543) cannot share a SQLAlchemy queue. Use the session pooler, or this NullPool path.
    args, pooled = engine_settings(url)
    parsed = make_url(url)
    if parsed.drivername in ("postgres", "postgresql"):
        url = parsed.set(drivername="postgresql+psycopg2")
    if pooled:
        from sqlalchemy.pool import NullPool
        return create_engine(url, poolclass=NullPool, pool_pre_ping=True, connect_args=args)
    return create_engine(url, pool_size=10, max_overflow=20, pool_pre_ping=True, connect_args=args)


engine = make_engine(DATABASE_URL)
Session = sessionmaker(bind=engine) if engine is not None else None


class Base(DeclarativeBase):
    pass


class Merchant(Base):
    __tablename__ = "merchants"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(150))
    store_name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(30))
    city: Mapped[str] = mapped_column(String(100), default="Bengaluru")
    category: Mapped[str] = mapped_column(String(100), default="Apparel & Boutique")
    tier: Mapped[str] = mapped_column(String(20), default="pro")
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Sku(Base):
    __tablename__ = "skus"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(100))
    supplier_name: Mapped[str] = mapped_column(String(200))
    supplier_phone: Mapped[str] = mapped_column(String(30), nullable=True)
    supplier_email: Mapped[str] = mapped_column(String(150), nullable=True)
    units: Mapped[int] = mapped_column(Integer, default=0)
    cost_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    selling_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    velocity: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=0)
    sold_last_30d: Mapped[int] = mapped_column(Integer, default=0)
    shelf_age_days: Mapped[int] = mapped_column(Integer, default=0)
    lead_time_days: Mapped[int] = mapped_column(Integer, default=7)
    moq: Mapped[int] = mapped_column(Integer, nullable=True)
    img_url: Mapped[str] = mapped_column(Text, nullable=True)
    reorder_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    clearance_discount: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ChannelAllocation(Base):
    __tablename__ = "channel_allocations"
    __table_args__ = (
        ForeignKeyConstraint(["sku_id", "merchant_id"], ["skus.id", "skus.merchant_id"], ondelete="CASCADE"),
    )
    sku_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    shopify_units: Mapped[int] = mapped_column(Integer, default=0)
    pos_units: Mapped[int] = mapped_column(Integer, default=0)
    warehouse_units: Mapped[int] = mapped_column(Integer, default=0)


class StockAlert(Base):
    __tablename__ = "stock_alerts"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    sku_id: Mapped[str] = mapped_column(String(50))
    alert_type: Mapped[str] = mapped_column(String(30))
    days_left: Mapped[int] = mapped_column(Integer)
    units_left: Mapped[int] = mapped_column(Integer)
    reorder_qty: Mapped[int] = mapped_column(Integer)
    is_reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    po_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    sku_id: Mapped[str] = mapped_column(String(50))
    supplier_name: Mapped[str] = mapped_column(String(200))
    supplier_phone: Mapped[str] = mapped_column(String(30))
    units_requested: Mapped[int] = mapped_column(Integer)
    channel: Mapped[str] = mapped_column(String(30), default="whatsapp")
    status: Mapped[str] = mapped_column(String(50), default="AWAITING_SUPPLIER_INVOICE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    __tablename__ = "db_audit_logs"
    log_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=True)
    action: Mapped[str] = mapped_column(String(50))
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[str] = mapped_column(String(100))
    before_state: Mapped[dict] = mapped_column(JSONB, nullable=True)
    after_state: Mapped[dict] = mapped_column(JSONB, nullable=True)
    checksum: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class UserSession(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    merchant_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def init_db():
    if engine is None:
        raise RuntimeError("DATABASE_URL is not set")
    path = os.path.join(BASE_DIR, "schema.sql")
    with open(path, encoding="utf-8") as handle:
        script = handle.read()
    statements = [part.strip() for part in script.split(";") if part.strip()]
    with engine.begin() as conn:
        conn.exec_driver_sql("SELECT pg_advisory_xact_lock(7314001)")
        for statement in statements:
            conn.exec_driver_sql(statement)


@contextmanager
def session_scope():
    if Session is None:
        raise RuntimeError("DATABASE_URL is not set")
    db = Session()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def now():
    return datetime.now(timezone.utc)


def money(value):
    return Decimal(str(value if value is not None else 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def rate(value):
    return Decimal(str(value if value is not None else 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def num(value):
    if value is None:
        return 0
    return float(value)


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return "pbkdf2_sha256$200000$%s$%s" % (salt, digest)


def check_password(password, stored):
    try:
        scheme, rounds, salt, digest = stored.split("$", 3)
    except ValueError:
        return False
    if scheme != "pbkdf2_sha256":
        return False
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(rounds)).hex()
    return hmac.compare_digest(check, digest)


def checksum(action, entity_type, entity_id, before, after):
    blob = json.dumps(
        {"action": action, "entity_type": entity_type, "entity_id": entity_id, "before": before, "after": after},
        sort_keys=True, default=str, separators=(",", ":"),
    ).encode()
    return hashlib.sha256(blob).hexdigest()


def audit(db, merchant_id, action, entity_type, entity_id, before, after):
    db.add(AuditLog(
        merchant_id=merchant_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        before_state=before,
        after_state=after,
        checksum=checksum(action, entity_type, entity_id, before, after),
        created_at=now(),
    ))


def token_hash(token):
    return hashlib.sha256((token or "").encode()).hexdigest()


def create_session(db, merchant_id):
    db.execute(delete(UserSession).where(UserSession.expires_at < now()))
    token = secrets.token_urlsafe(32)
    db.add(UserSession(
        token_hash=token_hash(token),
        merchant_id=merchant_id,
        created_at=now(),
        expires_at=now() + timedelta(days=SESSION_DAYS),
    ))
    return token


def read_token(token):
    if not token:
        return None
    with session_scope() as db:
        row = db.get(UserSession, token_hash(token))
        if not row or row.expires_at < now():
            return None
        return row.merchant_id


def logout(token):
    if not token:
        return
    with session_scope() as db:
        db.execute(delete(UserSession).where(UserSession.token_hash == token_hash(token)))


def first_name(full):
    part = (full or "").strip().split()
    return part[0] if part else "there"


def public_merchant(row):
    return {
        "uid": str(row.id),
        "name": row.full_name,
        "username": first_name(row.full_name),
        "shop": row.store_name,
        "email": row.email,
        "phone": row.phone,
        "category": row.category or "",
        "city": row.city or "Bengaluru",
    }


def register(fields):
    email = (fields.get("email") or "").strip().lower()
    password = fields.get("password") or ""
    name = (fields.get("name") or "").strip()
    shop = (fields.get("shop") or "").strip()
    phone = (fields.get("phone") or "").strip()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise ValueError("invalid-email")
    if len(password) < 6:
        raise ValueError("weak-password")
    if not name or not shop or not phone:
        raise ValueError("invalid-email")
    with session_scope() as db:
        if db.scalar(select(Merchant).where(Merchant.email == email)):
            raise ValueError("email-already-in-use")
        row = Merchant(
            id=uuid.uuid4(),
            email=email,
            password_hash=hash_password(password),
            full_name=name[:150],
            store_name=shop[:200],
            phone=phone[:30],
            city="Bengaluru",
            category=(fields.get("category") or "Apparel & Boutique")[:100],
            tier="pro",
            currency="INR",
            created_at=now(),
            updated_at=now(),
        )
        db.add(row)
        db.flush()
        body = public_merchant(row)
        audit(db, row.id, "CREATE", "merchant", row.id, None, body)
        return {"token": create_session(db, row.id), "merchant": body}


def login(fields):
    email = (fields.get("email") or "").strip().lower()
    password = fields.get("password") or ""
    with session_scope() as db:
        row = db.scalar(select(Merchant).where(Merchant.email == email))
        if not row or not check_password(password, row.password_hash):
            raise ValueError("invalid-credential")
        return {"token": create_session(db, row.id), "merchant": public_merchant(row)}


def sku_view(row, channels, loss):
    ch = channels or {}
    return {
        "id": row.id,
        "name": row.name,
        "cat": row.category,
        "supplier": row.supplier_name,
        "phone": row.supplier_phone or "",
        "email": row.supplier_email or "",
        "units": int(row.units or 0),
        "cost": num(row.cost_price),
        "price": num(row.selling_price),
        "vel": num(row.velocity),
        "sold": int(row.sold_last_30d or 0),
        "age": int(row.shelf_age_days or 0),
        "lead": int(row.lead_time_days or 7),
        "moq": int(row.moq) if row.moq else None,
        "img": row.img_url or "",
        "loss": num(loss),
        "channels": {
            "shopify": int(ch.get("shopify") or 0),
            "pos": int(ch.get("pos") or 0),
            "warehouse": int(ch.get("warehouse") or 0),
        },
        "clearance": num(row.clearance_discount),
        "locked": bool(row.reorder_locked),
    }


def apply_sku(row, raw, merchant_id):
    channels = raw.get("channels") or {}
    row.name = str(raw.get("name") or "Product")[:255]
    row.category = str(raw.get("cat") or raw.get("category") or "Apparel")[:100]
    row.supplier_name = str(raw.get("supplier") or raw.get("supplier_name") or "Local Vendor")[:200]
    row.supplier_phone = (str(raw.get("phone") or raw.get("supplier_phone") or "")[:30] or None)
    row.supplier_email = (str(raw.get("email") or raw.get("supplier_email") or "")[:150] or None)
    row.units = int(raw.get("units") or 0)
    row.cost_price = money(raw.get("cost") if raw.get("cost") is not None else raw.get("cost_price"))
    row.selling_price = money(raw.get("price") if raw.get("price") is not None else raw.get("selling_price"))
    row.velocity = rate(raw.get("vel") if raw.get("vel") is not None else raw.get("velocity"))
    row.sold_last_30d = int(raw.get("sold") or raw.get("sold_last_30d") or 0)
    row.shelf_age_days = int(raw.get("age") if raw.get("age") is not None else raw.get("shelf_age_days") or 0)
    row.lead_time_days = int(raw.get("lead") or raw.get("lead_time_days") or 7)
    moq = raw.get("moq")
    row.moq = int(moq) if moq else None
    row.img_url = raw.get("img") or raw.get("img_url") or None
    row.reorder_locked = bool(raw.get("locked"))
    row.clearance_discount = rate(raw.get("clearance") or 0)
    row.updated_at = now()
    row.merchant_id = merchant_id
    return {
        "shopify": int(channels.get("shopify") or 0),
        "pos": int(channels.get("pos") or 0),
        "warehouse": int(channels.get("warehouse") or 0),
    }


def alert_for(raw):
    units = int(raw.get("units") or 0)
    vel = float(raw.get("vel") or raw.get("velocity") or 0)
    age = int(raw.get("age") or raw.get("shelf_age_days") or 0)
    if units <= 0:
        return None
    per = max(vel, 0.05)
    days = units / per
    kind = None
    if age >= 60 and vel < 1:
        kind = "DEAD_STOCK"
    elif days < 2:
        kind = "CRITICAL"
    elif days < 5:
        kind = "LOW_STOCK"
    if not kind:
        return None
    lead = int(raw.get("lead") or 7)
    moq = int(raw.get("moq") or 1)
    cover = units / per
    qty = 0
    if not (cover >= lead and kind not in ("CRITICAL", "LOW_STOCK")):
        need = math.ceil(per * (lead + 14) - units)
        if need > 0:
            qty = max(moq, need)
    return {
        "alert_type": kind,
        "days_left": max(0, int(days)),
        "units_left": units,
        "reorder_qty": int(qty),
    }


def stamp_from(value):
    try:
        return datetime.fromtimestamp(float(value) / 1000, timezone.utc)
    except (TypeError, ValueError, OSError):
        return now()


def po_status(value):
    if str(value or "").lower() in ("received", "received_stock"):
        return "RECEIVED"
    return "AWAITING_SUPPLIER_INVOICE"


def client_po(row, product_name):
    status = "received" if row.status == "RECEIVED" else "sent"
    at = row.created_at or now()
    return {
        "id": row.po_id,
        "sku": row.sku_id,
        "name": product_name or row.supplier_name,
        "qty": int(row.units_requested or 0),
        "status": status,
        "at": int(at.timestamp() * 1000),
    }


def replace_book(merchant_id, payload):
    merchant_id = uuid.UUID(str(merchant_id))
    incoming = payload.get("skus") or []
    with session_scope() as db:
        merchant = db.get(Merchant, merchant_id)
        if not merchant:
            raise ValueError("unauthorized")
        existing = {row.id: row for row in db.scalars(select(Sku).where(Sku.merchant_id == merchant_id))}
        channels = {
            row.sku_id: row for row in db.scalars(select(ChannelAllocation).where(ChannelAllocation.merchant_id == merchant_id))
        }
        seen = set()
        for raw in incoming:
            sku_id = str(raw.get("id") or "").strip()
            if not sku_id:
                continue
            seen.add(sku_id)
            before = None
            row = existing.get(sku_id)
            if row is None:
                row = Sku(id=sku_id[:50], merchant_id=merchant_id, created_at=now())
                db.add(row)
                action = "CREATE"
            else:
                ch = channels.get(sku_id)
                before = sku_view(row, {
                    "shopify": ch.shopify_units if ch else 0,
                    "pos": ch.pos_units if ch else 0,
                    "warehouse": ch.warehouse_units if ch else 0,
                }, raw.get("loss") or 0)
                action = "UPDATE"
            alloc = apply_sku(row, raw, merchant_id)
            after = sku_view(row, alloc, raw.get("loss") or 0)
            if before == after:
                continue
            db.flush()
            ch = channels.get(sku_id)
            if ch is None:
                ch = ChannelAllocation(sku_id=row.id, merchant_id=merchant_id)
                db.add(ch)
                channels[sku_id] = ch
            ch.shopify_units = alloc["shopify"]
            ch.pos_units = alloc["pos"]
            ch.warehouse_units = alloc["warehouse"]
            audit(db, merchant_id, action, "sku", sku_id, before, after)
        gone = [sku_id for sku_id in existing if sku_id not in seen]
        for sku_id in gone:
            row = existing[sku_id]
            ch = channels.get(sku_id)
            before = sku_view(row, {
                "shopify": ch.shopify_units if ch else 0,
                "pos": ch.pos_units if ch else 0,
                "warehouse": ch.warehouse_units if ch else 0,
            }, 0)
            audit(db, merchant_id, "DELETE", "sku", sku_id, before, None)
        if gone:
            db.execute(delete(StockAlert).where(StockAlert.merchant_id == merchant_id, StockAlert.sku_id.in_(gone)))
            db.execute(delete(Sku).where(Sku.merchant_id == merchant_id, Sku.id.in_(gone)))
        db.execute(delete(StockAlert).where(StockAlert.merchant_id == merchant_id))
        db.flush()
        for raw in incoming:
            found = alert_for(raw)
            if not found or not raw.get("id"):
                continue
            db.add(StockAlert(
                id=uuid.uuid4(),
                merchant_id=merchant_id,
                sku_id=str(raw["id"])[:50],
                alert_type=found["alert_type"],
                days_left=found["days_left"],
                units_left=found["units_left"],
                reorder_qty=found["reorder_qty"],
                is_reviewed=False,
                created_at=now(),
            ))
        _sync_orders(db, merchant_id, payload.get("orders") or [], {str(raw.get("id")): raw for raw in incoming})
        _sync_events(db, merchant_id, "sale", payload.get("sales") or [], "timestamp")
        _sync_events(db, merchant_id, "purchase", payload.get("purchases") or [], "at")
        merchant.updated_at = now()
    return load_book(merchant_id)


def _sync_orders(db, merchant_id, orders, skus_by_id):
    current = {row.po_id: row for row in db.scalars(select(PurchaseOrder).where(PurchaseOrder.merchant_id == merchant_id))}
    seen = set()
    for order in orders:
        po_id = str(order.get("id") or order.get("po_id") or "")[:50]
        if not po_id:
            continue
        seen.add(po_id)
        sku_id = str(order.get("sku") or order.get("sku_id") or "")[:50]
        raw = skus_by_id.get(sku_id) or {}
        supplier = str(raw.get("supplier") or order.get("supplier_name") or "Supplier")[:200]
        phone = str(raw.get("phone") or order.get("supplier_phone") or " ")[:30] or " "
        status = po_status(order.get("status"))
        row = current.get(po_id)
        after = {
            "po_id": po_id, "sku_id": sku_id, "supplier_name": supplier,
            "supplier_phone": phone, "units_requested": int(order.get("qty") or order.get("units_requested") or 0),
            "status": status,
        }
        if row is None:
            db.add(PurchaseOrder(
                po_id=po_id, merchant_id=merchant_id, sku_id=sku_id or "-",
                supplier_name=supplier, supplier_phone=phone,
                units_requested=after["units_requested"], channel="whatsapp", status=status,
                created_at=stamp_from(order.get("at")),
            ))
            audit(db, merchant_id, "PO_DISPATCH", "po", po_id, None, after)
            continue
        before = {"po_id": row.po_id, "sku_id": row.sku_id, "status": row.status, "units_requested": row.units_requested}
        if before["status"] == status and before["units_requested"] == after["units_requested"]:
            continue
        row.status = status
        row.units_requested = after["units_requested"]
        row.supplier_name = supplier
        row.supplier_phone = phone
        audit(db, merchant_id, "UPDATE", "po", po_id, before, after)
    for po_id, row in current.items():
        if po_id in seen:
            continue
        audit(db, merchant_id, "DELETE", "po", po_id, {"po_id": po_id, "sku_id": row.sku_id, "status": row.status}, None)
        db.delete(row)


def _event_key(row, field):
    state = row.after_state or {}
    return "%s:%s" % (state.get(field), state.get("sku") or state.get("id"))


def _sync_events(db, merchant_id, entity_type, rows, field):
    have = db.scalars(select(AuditLog).where(AuditLog.merchant_id == merchant_id, AuditLog.entity_type == entity_type))
    seen = {_event_key(row, field) for row in have}
    action = "CREATE" if entity_type == "sale" else "PO_DISPATCH"
    for raw in rows:
        key = "%s:%s" % (raw.get(field), raw.get("sku") or raw.get("id"))
        if key in seen:
            continue
        seen.add(key)
        audit(db, merchant_id, action, entity_type, str(raw.get("id") or raw.get("sku") or entity_type), None, raw)


def load_book(merchant_id):
    merchant_id = uuid.UUID(str(merchant_id))
    with session_scope() as db:
        merchant = db.get(Merchant, merchant_id)
        if not merchant:
            raise ValueError("unauthorized")
        rows = list(db.scalars(select(Sku).where(Sku.merchant_id == merchant_id)))
        allocs = {row.sku_id: row for row in db.scalars(select(ChannelAllocation).where(ChannelAllocation.merchant_id == merchant_id))}
        loss = {}
        audits = db.scalars(
            select(AuditLog)
            .where(AuditLog.merchant_id == merchant_id, AuditLog.entity_type == "sku", AuditLog.action != "DELETE")
            .order_by(AuditLog.log_id.desc())
        )
        for entry in audits:
            if entry.entity_id in loss:
                continue
            state = entry.after_state or {}
            if "loss" in state:
                loss[entry.entity_id] = state.get("loss") or 0
        skus = []
        clearance = {}
        locked = {}
        names = {}
        for row in rows:
            ch = allocs.get(row.id)
            view = sku_view(row, {
                "shopify": ch.shopify_units if ch else 0,
                "pos": ch.pos_units if ch else 0,
                "warehouse": ch.warehouse_units if ch else 0,
            }, loss.get(row.id, 0))
            if view["clearance"]:
                clearance[view["id"]] = view["clearance"]
            if view["locked"]:
                locked[view["id"]] = True
            names[row.id] = row.name
            skus.append(view)
        orders = []
        for po in db.scalars(select(PurchaseOrder).where(PurchaseOrder.merchant_id == merchant_id).order_by(PurchaseOrder.created_at)):
            orders.append(client_po(po, names.get(po.sku_id)))
        sales = []
        purchases = []
        events = db.scalars(
            select(AuditLog)
            .where(AuditLog.merchant_id == merchant_id, AuditLog.entity_type.in_(["sale", "purchase"]))
            .order_by(AuditLog.log_id)
        )
        for entry in events:
            state = entry.after_state or {}
            if entry.entity_type == "sale":
                sales.append(state)
            else:
                purchases.append(state)
        sales.sort(key=lambda row: row.get("timestamp") or 0, reverse=True)
        return {
            "merchant": public_merchant(merchant),
            "skus": skus,
            "clearance": clearance,
            "locked": locked,
            "sales": sales,
            "orders": orders,
            "purchases": purchases,
        }


def load_sample(merchant_id, rows):
    return replace_book(merchant_id, {"skus": rows, "sales": [], "orders": [], "purchases": []})
