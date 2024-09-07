from flask import Flask

app = Flask(__name__)

@app.route('/')
def hello():
    return "Hello, Flask is running on Bluehost with Python 3.11!"

if __name__ == '__main__':
    app.run()
