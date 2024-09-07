import os
import sys

# Define the path to the virtual environment
VIRTUAL_ENV = '/home/kpjotomy/public_html/Certas/venv'

# Update the environment to use the virtual environment
os.environ['VIRTUAL_ENV'] = VIRTUAL_ENV
os.environ['PATH'] = f"{VIRTUAL_ENV}/bin:" + os.environ['PATH']
os.environ.pop('PYTHONHOME', None)
