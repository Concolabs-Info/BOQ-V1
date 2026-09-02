.PHONY: dev down logs db api web test test-api typecheck syntax openapi clean zip

DEV_ENV = set -a; [ -f ../.env ] && . ../.env; set +a;

dev:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=200

db:
	docker compose up -d db

api:
	cd backend && $(DEV_ENV) uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

web:
	cd frontend && npm run dev

test: test-api typecheck syntax

test-api:
	cd backend && PYTHONPATH=. pytest -q

typecheck:
	cd frontend && npm run typecheck

syntax:
	cd frontend && npm run test:syntax

openapi:
	cd backend && PYTHONPATH=. python ../infrastructure/scripts/generate_openapi.py

clean:
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	rm -rf backend/.pytest_cache frontend/.next

zip: clean
	cd .. && zip -r Quanto-Pre-Production-Final.zip Quanto \
		-x 'Quanto/.git/*' 'Quanto/node_modules/*' 'Quanto/frontend/.next/*' 'Quanto/.venv/*'
