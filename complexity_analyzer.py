import ast

class ComplexityVisitor(ast.NodeVisitor):
    def __init__(self):
        self.max_depth = 0
        self.current_depth = 0

    def visit_For(self, node):
        self._visit_loop(node)

    def visit_While(self, node):
        self._visit_loop(node)

    def visit_ListComp(self, node):
        # A list comprehension contains at least one loop
        self.current_depth += 1
        self.max_depth = max(self.max_depth, self.current_depth)
        self.generic_visit(node)
        self.current_depth -= 1

    def visit_DictComp(self, node):
        self.current_depth += 1
        self.max_depth = max(self.max_depth, self.current_depth)
        self.generic_visit(node)
        self.current_depth -= 1

    def visit_SetComp(self, node):
        self.current_depth += 1
        self.max_depth = max(self.max_depth, self.current_depth)
        self.generic_visit(node)
        self.current_depth -= 1

    def visit_GeneratorExp(self, node):
        self.current_depth += 1
        self.max_depth = max(self.max_depth, self.current_depth)
        self.generic_visit(node)
        self.current_depth -= 1

    def _visit_loop(self, node):
        self.current_depth += 1
        self.max_depth = max(self.max_depth, self.current_depth)
        self.generic_visit(node)
        self.current_depth -= 1

def analyze_python_complexity(code_string):
    """
    Estimates Time Complexity of Python code using simple AST heuristics.
    Returns a tuple: (time_complexity, space_complexity)
    """
    try:
        tree = ast.parse(code_string)
        visitor = ComplexityVisitor()
        visitor.visit(tree)
        
        # Heuristic rules based on max loop depth
        depth = visitor.max_depth
        
        if depth == 0:
            time_complexity = "O(1)"
        elif depth == 1:
            time_complexity = "O(N)"
        elif depth == 2:
            time_complexity = "O(N^2)"
        elif depth == 3:
            time_complexity = "O(N^3)"
        else:
            time_complexity = f"O(N^{depth})"
            
        # Space complexity is much harder to determine statically without flow analysis.
        # Returning a placeholder for now as discussed in the plan.
        space_complexity = "N/A"
        
        return time_complexity, space_complexity
        
    except SyntaxError:
        # If the code has a syntax error, we can't parse it
        return "N/A (Syntax Error)", "N/A"
    except Exception as e:
        return f"N/A (Error: {str(e)})", "N/A"
