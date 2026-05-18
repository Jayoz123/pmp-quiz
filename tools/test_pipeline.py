"""pytest tests for extract_questions.py and convert_to_json.py"""
import pytest
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from tools.extract_questions import (
    infer_domain, remove_duplicates, parse_questions
)

def test_infer_domain_risk():
    assert infer_domain('What is the best way to mitigate a risk?') == 'Risk'

def test_infer_domain_cost():
    assert infer_domain('The project CPI is 0.8. What does this mean?') == 'Cost'

def test_infer_domain_fallback():
    # Very generic text → General
    d = infer_domain('abc def ghi')
    assert isinstance(d, str)

def test_remove_duplicates_basic():
    q = [
        {'question': 'What is the WBS?', 'answer_a':'', 'answer_b':'', 'answer_c':'', 'answer_d':'', 'correct':'A', 'explanation':''},
        {'question': 'What is the WBS?', 'answer_a':'', 'answer_b':'', 'answer_c':'', 'answer_d':'', 'correct':'B', 'explanation':''},
        {'question': 'Different question here?', 'answer_a':'', 'answer_b':'', 'answer_c':'', 'answer_d':'', 'correct':'A', 'explanation':''},
    ]
    result = remove_duplicates(q)
    assert len(result) == 2

def test_parse_questions_minimal():
    sample = """
1. What does PM stand for?
A. Project Manager
B. Program Management
C. Process Model
D. Partial Milestone
Answer: A
Explanation: PM stands for Project Manager in PMP context.

2. What is a Gantt chart used for?
A. Budget tracking
B. Schedule visualization
C. Risk analysis
D. Stakeholder mapping
Answer: B
Explanation: Gantt charts visualize project schedules over time.
"""
    questions = parse_questions(sample)
    assert len(questions) >= 1
    # Verify correct answer is mapped
    for q in questions:
        assert q['correct'] in ['A', 'B', 'C', 'D']
        assert len(q['question']) > 0


import openpyxl, json, tempfile, os
from tools.convert_to_json import convert, LETTER_TO_INDEX

def _make_xlsx(rows):
    """Helper: create a temp xlsx with given rows, return path."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(['ID', 'Domain', 'Question', 'Answer_A', 'Answer_B', 'Answer_C', 'Answer_D', 'Correct', 'Explanation'])
    for row in rows:
        ws.append(row)
    path = tempfile.mktemp(suffix='.xlsx')
    wb.save(path)
    return path

def test_convert_basic():
    path = _make_xlsx([[1, 'Risk', 'Q1?', 'Odp1', 'Odp2', 'Odp3', 'Odp4', 'A', 'Wyjaśnienie']])
    out = tempfile.mktemp(suffix='.json')
    result = convert(path, out)
    assert len(result) == 1
    q = result[0]
    assert q['id'] == 1
    assert q['domain'] == 'Risk'
    assert q['question'] == 'Q1?'
    assert len(q['answers']) == 4
    assert q['answers'][q['correct']] == 'Odp1'  # Correct answer is Odp1 (was Answer_A=A)
    os.unlink(path); os.unlink(out)

def test_convert_correct_answer_preserved():
    """Regardless of shuffle, answers[correct] must always be the original A answer."""
    path = _make_xlsx([[1, 'Cost', 'Q?', 'Correct', 'Wrong1', 'Wrong2', 'Wrong3', 'A', '']])
    out = tempfile.mktemp(suffix='.json')
    for _ in range(10):  # Run multiple times to test shuffle stability
        result = convert(path, out)
        q = result[0]
        assert q['answers'][q['correct']] == 'Correct'
    os.unlink(path); os.unlink(out)

def test_convert_skips_invalid_correct():
    path = _make_xlsx([[1, 'Risk', 'Q?', 'A', 'B', 'C', 'D', 'X', '']])  # X is invalid
    out = tempfile.mktemp(suffix='.json')
    result = convert(path, out)
    assert len(result) == 0
    os.unlink(path); os.unlink(out)

def test_letter_to_index_mapping():
    assert LETTER_TO_INDEX['A'] == 0
    assert LETTER_TO_INDEX['D'] == 3
