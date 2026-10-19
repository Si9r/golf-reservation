from alembic import context
from sqlalchemy import create_engine

from app.config import env

url = context.get_x_argument(as_dictionary=True).get("url") or env.DATABASE_URL


def run() -> None:
    engine = create_engine(url)
    with engine.connect() as c:
        context.configure(connection=c, target_metadata=None)
        with context.begin_transaction():
            context.run_migrations()


run()
