"""
app.py - Main Flask application for the Browser-Based Code Editor
A VS Code-like editor with code execution, saving, and snippet management.
"""

import os
import subprocess
import tempfile
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, jsonify, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash

import complexity_analyzer

# ---------------------------------------------------------------------------
# App Configuration
# ---------------------------------------------------------------------------
app = Flask(__name__)

# Use environment variable for secret key in production
app.secret_key = os.environ.get('SECRET_KEY', 'super-secret-key-codeeditor-2024')

# Use environment variable for database URL (PostgreSQL) or fallback to local SQLite
database_url = os.environ.get('DATABASE_URL')
if database_url and database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url or 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.login_view = 'login'
login_manager.init_app(app)


# ---------------------------------------------------------------------------
# Database Models
# ---------------------------------------------------------------------------
class User(UserMixin, db.Model):
    """User model for authentication."""
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    snippets = db.relationship('Snippet', backref='author', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Snippet(db.Model):
    """Represents a saved code snippet in the database."""
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    filename = db.Column(db.String(100), nullable=False)
    language = db.Column(db.String(50), nullable=False)
    code = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    def __repr__(self):
        return f'<Snippet {self.filename} ({self.language})>'


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# ---------------------------------------------------------------------------
# Auth Routes
# ---------------------------------------------------------------------------

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')

        if not username or not password:
            flash('Username and password are required.')
            return redirect(url_for('register'))

        if password != confirm_password:
            flash('Passwords do not match.')
            return redirect(url_for('register'))

        user_exists = User.query.filter_by(username=username).first()
        if user_exists:
            flash('Username already exists.')
            return redirect(url_for('register'))

        new_user = User(username=username)
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()
        flash('Registration successful! Please login.')
        return redirect(url_for('login'))

    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()

        if user and user.check_password(password):
            login_user(user)
            return redirect(url_for('index'))
        else:
            flash('Invalid username or password.')

    return render_template('login.html')


@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))


# ---------------------------------------------------------------------------
# Editor Routes
# ---------------------------------------------------------------------------

@app.route('/', methods=['GET'])
@login_required
def index():
    """
    Main editor page.
    If ?id= query parameter is provided, load that snippet from DB
    and pre-populate the editor.
    """
    snippet = None
    snippet_id = request.args.get('id')
    if snippet_id:
        snippet = Snippet.query.filter_by(id=snippet_id, user_id=current_user.id).first()

    # Load all saved snippets for the sidebar (user specific)
    all_snippets = Snippet.query.filter_by(user_id=current_user.id).order_by(Snippet.created_at.desc()).all()
    return render_template('index.html', snippet=snippet, all_snippets=all_snippets)


@app.route('/run', methods=['POST'])
@login_required
def run_code():
    """
    Execute submitted code using subprocess in a temp file.
    Returns JSON with stdout, stderr, and code complexity metrics.
    Security: max 5000 chars, 5-second timeout, temp file cleanup.
    """
    data = request.get_json()
    code = data.get('code', '')
    language = data.get('language', 'python')

    # Security: enforce max code length
    if len(code) > 5000:
        return jsonify({'error': 'Code exceeds 5000 character limit.'}), 400

    # Map languages to execution commands and extensions
    lang_configs = {
        'python': {'cmd': ['python'], 'ext': '.py'},
        'javascript': {'cmd': ['node'], 'ext': '.js'}
    }

    # Calculate complexity (Python only via AST)
    time_comp = "N/A"
    space_comp = "N/A"
    if language == 'python' and code.strip():
        time_comp, space_comp = complexity_analyzer.analyze_python_complexity(code)

    # Handle HTML/CSS (Preview and return early)
    if language in ['html', 'css']:
        return jsonify({
            'output': '', 'error': '', 'is_web': True,
            'web_code': code,
            'time_complexity': time_comp, 'space_complexity': space_comp
        })

    # For Executable languages (Python, JS)
    config = lang_configs.get(language)
    if not config:
        return jsonify({
            'output': '', 'error': f'Execution for {language} is not supported yet.',
            'time_complexity': time_comp, 'space_complexity': space_comp
        }), 400

    tmp_path = None
    try:
        # Write code to a temporary file
        with tempfile.NamedTemporaryFile(
            mode='w', suffix=config['ext'], delete=False, encoding='utf-8'
        ) as tmp_file:
            tmp_file.write(code)
            tmp_path = tmp_file.name

        # Execute the temp file with a 5-second timeout
        result = subprocess.run(
            config['cmd'] + [tmp_path],
            capture_output=True,
            text=True,
            timeout=5
        )

        stdout = result.stdout
        stderr = result.stderr

        if stderr:
            return jsonify({'output': stdout, 'error': stderr, 'is_web': False, 'time_complexity': time_comp, 'space_complexity': space_comp})
        return jsonify({'output': stdout, 'error': '', 'is_web': False, 'time_complexity': time_comp, 'space_complexity': space_comp})

    except subprocess.TimeoutExpired:
        return jsonify({'output': '', 'error': 'Code timed out after 5 seconds.', 'is_web': False, 'time_complexity': time_comp, 'space_complexity': space_comp})

    except Exception as e:
        return jsonify({'output': '', 'error': f'Execution error: {str(e)}', 'is_web': False, 'time_complexity': time_comp, 'space_complexity': space_comp}), 500

    finally:
        # Always clean up the temporary file
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.route('/save', methods=['POST'])
@login_required
def save_snippet():
    """
    Save a code snippet to the database.
    Receives form data: filename, language, code.
    Redirects to /saved on success.
    """
    filename = request.form.get('filename', '').strip()
    language = request.form.get('language', 'python')
    code = request.form.get('code', '')

    # Basic validation
    if not filename:
        return redirect(url_for('index'))

    if not code:
        return redirect(url_for('index'))

    new_snippet = Snippet(
        filename=filename,
        language=language,
        code=code,
        user_id=current_user.id
    )
    db.session.add(new_snippet)
    db.session.commit()

    return redirect(url_for('saved'))


@app.route('/saved', methods=['GET'])
@login_required
def saved():
    """
    Display all saved snippets in a table for the current user.
    """
    snippets = Snippet.query.filter_by(user_id=current_user.id).order_by(Snippet.created_at.desc()).all()
    return render_template('saved.html', snippets=snippets)


@app.route('/delete/<int:snippet_id>', methods=['POST'])
@login_required
def delete_snippet(snippet_id):
    """
    Delete a snippet by its ID (must belong to current user).
    Redirects to /saved after deletion.
    """
    snippet = Snippet.query.filter_by(id=snippet_id, user_id=current_user.id).first_or_404()
    db.session.delete(snippet)
    db.session.commit()
    return redirect(url_for('saved'))


# ---------------------------------------------------------------------------
# DB Init + Entry Point
# ---------------------------------------------------------------------------
with app.app_context():
    db.create_all()
    print("Database tables ensured.")

if __name__ == '__main__':
    print("Starting CodeEditor on http://localhost:5000")
    app.run(debug=True)
