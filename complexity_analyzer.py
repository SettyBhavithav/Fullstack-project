import ast

class TimeComplexityVisitor(ast.NodeVisitor):
    def __init__(self):
        self.max_depth = 0
        self.current_depth = 0

    def visit_For(self, node):
        self._visit_loop(node)

    def visit_While(self, node):
        self._visit_loop(node)

    def visit_ListComp(self, node):
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

    def _visit_loop(self, node):
        self.current_depth += 1
        self.max_depth = max(self.max_depth, self.current_depth)
        self.generic_visit(node)
        self.current_depth -= 1

class SpaceComplexityVisitor(ast.NodeVisitor):
    def __init__(self):
        self.space_complexity = 0 # 0: O(1), 1: O(N), 2: O(N^2)
        self.in_loop = False
        self.nesting_level = 0

    def visit_For(self, node):
        self.in_loop = True
        self.nesting_level += 1
        self.generic_visit(node)
        self.nesting_level -= 1
        if self.nesting_level == 0:
            self.in_loop = False

    def visit_While(self, node):
        self.in_loop = True
        self.nesting_level += 1
        self.generic_visit(node)
        self.nesting_level -= 1
        if self.nesting_level == 0:
            self.in_loop = False

    def visit_List(self, node):
        # List literal []
        self._check_allocation()
        self.generic_visit(node)

    def visit_Dict(self, node):
        # Dict literal {}
        self._check_allocation()
        self.generic_visit(node)

    def visit_Set(self, node):
        # Set literal {1, 2}
        self._check_allocation()
        self.generic_visit(node)

    def visit_ListComp(self, node):
        self.space_complexity = max(self.space_complexity, 1)
        self.generic_visit(node)

    def visit_DictComp(self, node):
        self.space_complexity = max(self.space_complexity, 1)
        self.generic_visit(node)

    def visit_Call(self, node):
        # Check for list(), dict(), set() or append()
        if isinstance(node.func, ast.Name):
            if node.func.id in ['list', 'dict', 'set']:
                self._check_allocation()
        elif isinstance(node.func, ast.Attribute):
            if node.func.attr in ['append', 'extend', 'add', 'update']:
                self._check_allocation()
        self.generic_visit(node)

    def visit_AugAssign(self, node):
        # res += [item] grows space
        if isinstance(node.op, ast.Add):
            self._check_allocation()
        self.generic_visit(node)

    def _check_allocation(self):
        if self.in_loop:
            # Allocation inside a loop implies space grows with N
            self.space_complexity = max(self.space_complexity, self.nesting_level)
        else:
            # Single allocation outside loop is usually constant O(1) in terms of N
            # But for simple heuristic, we'll call it O(1) unless it's a dynamic structure
            pass

def analyze_python_complexity(code_string):
    """
    Estimates Time and Space Complexity of Python code using simple AST heuristics.
    Returns a tuple: (time_complexity, space_complexity)
    """
    try:
        tree = ast.parse(code_string)
        
        # Time Complexity
        time_visitor = TimeComplexityVisitor()
        time_visitor.visit(tree)
        depth = time_visitor.max_depth
        
        if depth == 0:
            time_complexity = "O(1)"
        elif depth == 1:
            time_complexity = "O(N)"
        elif depth == 2:
            time_complexity = "O(N^2)"
        else:
            time_complexity = f"O(N^{depth})"
            
        # Space Complexity
        space_visitor = SpaceComplexityVisitor()
        space_visitor.visit(tree)
        s_depth = space_visitor.space_complexity
        
        if s_depth == 0:
            space_complexity = "O(1)"
        elif s_depth == 1:
            space_complexity = "O(N)"
        elif s_depth == 2:
            space_complexity = "O(N^2)"
        else:
            space_complexity = f"O(N^{s_depth})"
        
        return time_complexity, space_complexity
        
    except SyntaxError:
        return "N/A (Syntax Error)", "N/A"
    except Exception as e:
        return f"N/A (Error: {str(e)})", "N/A"
