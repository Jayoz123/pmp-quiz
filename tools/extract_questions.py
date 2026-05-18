#!/usr/bin/env python3
"""
Ekstrahuje pytania z plików PDF PMP i zapisuje do questions_en.xlsx.
Użycie: python tools/extract_questions.py
"""
import pdfplumber
import openpyxl
import re
import random
import os
import sys

PDF_FILES = [
    "404451735-Questions-and-Answers-PMP-Exam-Prep.pdf",
    "983625620-PMP-Exam-Prep-2025-2026-All-In-One-Guide-to-Passing-With-Confidence-Including-1-100-Practice-Test-Proven-Strategies-to-Get-Publication-NewGrade.pdf",
]

PMP_DOMAINS = ['Risk', 'Cost', 'Schedule', 'Scope', 'Quality', 'Resource',
               'Communications', 'Stakeholder', 'Procurement', 'Integration',
               'People', 'Process', 'Business Environment']

DOMAIN_KEYWORDS = {
    'Risk': ['risk', 'threat', 'opportunity', 'probability', 'impact', 'mitigation'],
    'Cost': ['cost', 'budget', 'EVM', 'earned value', 'CPI', 'CV', 'BAC', 'EAC'],
    'Schedule': ['schedule', 'SPI', 'SV', 'critical path', 'float', 'slack', 'CPM'],
    'Scope': ['scope', 'WBS', 'requirements', 'deliverable', 'change request'],
    'Quality': ['quality', 'QA', 'QC', 'defect', 'audit', 'process improvement'],
    'Resource': ['resource', 'team', 'RACI', 'staffing', 'training', 'HR'],
    'Communications': ['communication', 'report', 'stakeholder', 'message', 'channel'],
    'Stakeholder': ['stakeholder', 'engagement', 'register', 'influence', 'interest'],
    'Procurement': ['procurement', 'contract', 'vendor', 'RFP', 'SOW', 'make-or-buy'],
    'Integration': ['integration', 'charter', 'project plan', 'change control', 'lessons'],
    'People': ['servant leader', 'emotional intelligence', 'conflict', 'motivation', 'team'],
    'Process': ['process group', 'knowledge area', 'initiating', 'planning', 'executing'],
    'Business Environment': ['compliance', 'governance', 'benefit', 'strategy', 'organization'],
}


def infer_domain(question_text, explanation_text=''):
    text = (question_text + ' ' + explanation_text).lower()
    scores = {domain: 0 for domain in PMP_DOMAINS}
    for domain, keywords in DOMAIN_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in text:
                scores[domain] += 1
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else 'General'


def extract_text_from_pdf(path):
    pages = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
    return '\n'.join(pages)


def parse_questions(text):
    """
    Parses common PMP PDF question formats:
    - Numbered questions: "1." or "Question 1:" or "1)"
    - Answer choices: "A." "B." "C." "D." or "A)" "(A)"
    - Correct answer: "Answer: B" or "Correct Answer: B" or "The correct answer is B"
    - Explanation: text after correct answer marker
    """
    questions = []

    # Split into question blocks by question number
    block_pattern = re.compile(
        r'(?:^|\n)(?:Question\s+)?(\d+)[.):\s]+(.+?)(?=(?:^|\n)(?:Question\s+)?\d+[.):\s]|\Z)',
        re.DOTALL | re.MULTILINE | re.IGNORECASE
    )

    answer_choice_pattern = re.compile(
        r'(?:^|\n)\s*[(\[]?([A-D])[.):\]\s]\s*(.+?)(?=(?:^|\n)\s*[(\[]?[A-D][.):\]\s]|(?:^|\n)\s*(?:Answer|Correct)|$)',
        re.DOTALL | re.MULTILINE
    )

    correct_pattern = re.compile(
        r'(?:Answer|Correct\s+Answer|The\s+correct\s+answer\s+is)[:\s]+([A-D])',
        re.IGNORECASE
    )

    explanation_pattern = re.compile(
        r'(?:Explanation|Rationale|Because|Since)[:\s]+(.+?)(?=(?:^|\n)(?:Question\s+)?\d+[.):\s]|\Z)',
        re.DOTALL | re.IGNORECASE
    )

    for match in block_pattern.finditer(text):
        block = match.group(2).strip()
        lines = block.split('\n')
        question_lines = []
        rest = block

        # Extract question text (lines before answer choices)
        for i, line in enumerate(lines):
            if re.match(r'\s*[(\[]?[A-D][.):\]\s]', line):
                rest = '\n'.join(lines[i:])
                break
            question_lines.append(line.strip())

        question_text = ' '.join(q for q in question_lines if q).strip()
        if len(question_text) < 20:
            continue

        # Extract answer choices
        choices = {}
        for cm in answer_choice_pattern.finditer(rest):
            letter = cm.group(1).upper()
            text = re.sub(r'\s+', ' ', cm.group(2)).strip()
            if text:
                choices[letter] = text

        if len(choices) < 2:
            continue

        # Extract correct answer
        correct_match = correct_pattern.search(rest)
        if not correct_match:
            continue
        correct_letter = correct_match.group(1).upper()
        if correct_letter not in choices:
            continue

        # Extract explanation
        exp_match = explanation_pattern.search(rest)
        explanation = re.sub(r'\s+', ' ', exp_match.group(1)).strip() if exp_match else ''

        # Build answer list with correct at determined position, others shuffled
        other_letters = [l for l in ['A', 'B', 'C', 'D'] if l in choices and l != correct_letter]
        random.shuffle(other_letters)
        all_letters = ['A', 'B', 'C', 'D']
        # Shuffle placement of correct answer
        correct_col = random.choice(all_letters)
        remaining_cols = [c for c in all_letters if c != correct_col]
        mapping = {correct_col: correct_letter}
        for col, src in zip(remaining_cols, other_letters):
            mapping[col] = src

        answers = {col: choices.get(mapping[col], '') for col in all_letters}

        questions.append({
            'question': question_text,
            'answer_a': answers['A'],
            'answer_b': answers['B'],
            'answer_c': answers['C'],
            'answer_d': answers['D'],
            'correct': correct_col,
            'explanation': explanation,
        })

    return questions


def remove_duplicates(questions):
    seen = set()
    unique = []
    for q in questions:
        key = re.sub(r'\s+', ' ', q['question'][:80].lower().strip())
        if key not in seen:
            seen.add(key)
            unique.append(q)
    return unique


def save_to_excel(questions, output_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Questions'
    headers = ['ID', 'Domain', 'Question', 'Answer_A', 'Answer_B', 'Answer_C', 'Answer_D', 'Correct', 'Explanation']
    ws.append(headers)

    # Style header row
    from openpyxl.styles import Font, PatternFill, Alignment
    header_fill = PatternFill(start_color='6366F1', end_color='6366F1', fill_type='solid')
    for cell in ws[1]:
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')

    # Set column widths
    ws.column_dimensions['A'].width = 6
    ws.column_dimensions['B'].width = 16
    ws.column_dimensions['C'].width = 60
    for col in ['D', 'E', 'F', 'G']:
        ws.column_dimensions[col].width = 35
    ws.column_dimensions['H'].width = 10
    ws.column_dimensions['I'].width = 60

    for i, q in enumerate(questions, start=1):
        domain = infer_domain(q['question'], q['explanation'])
        ws.append([
            i, domain,
            q['question'], q['answer_a'], q['answer_b'], q['answer_c'], q['answer_d'],
            q['correct'], q['explanation'],
        ])
        # Wrap text in long cells
        for col in [3, 4, 5, 6, 7, 9]:
            ws.cell(row=i+1, column=col).alignment = Alignment(wrap_text=True, vertical='top')

    wb.save(output_path)
    print(f'Saved {len(questions)} questions to {output_path}')


def main():
    all_questions = []
    for pdf_file in PDF_FILES:
        if not os.path.exists(pdf_file):
            print(f'WARNING: {pdf_file} not found, skipping')
            continue
        print(f'Processing {pdf_file}...')
        text = extract_text_from_pdf(pdf_file)
        questions = parse_questions(text)
        print(f'  Extracted {len(questions)} questions')
        all_questions.extend(questions)

    all_questions = remove_duplicates(all_questions)
    print(f'After deduplication: {len(all_questions)} questions')

    if not all_questions:
        print('ERROR: No questions extracted. Check PDF format.')
        sys.exit(1)

    save_to_excel(all_questions, 'questions_en.xlsx')
    print('\nNext step: translate questions_en.xlsx to Polish, save as questions_pl.xlsx')


if __name__ == '__main__':
    main()
