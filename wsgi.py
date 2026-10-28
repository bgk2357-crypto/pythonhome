"""PythonAnywhere entry point; put the project root on sys.path in the Web tab."""
from flask_app import create_app

application = create_app()
