/**
 * script.js — jQuery interactions for the CodeEditor VS Code Clone
 * Handles: Run, Save, Clear, Copy, Line Count, Delete, Sidebar navigation
 */

/* ======================================================================
   CodeMirror Editor Initialization
   (IIFE to keep variables scoped; editor exposed as window.editor)
====================================================================== */
$(function () {

    'use strict';

    // ----------------------------------------------------------------
    // 1. Initialize CodeMirror
    // ----------------------------------------------------------------
    var editorTextarea = document.getElementById('codeEditor');

    // Only initialize on the main editor page
    if (!editorTextarea) return;

    // Map language dropdown values to CodeMirror modes
    var LANG_MODE_MAP = {
        python:     'python',
        javascript: 'javascript',
        html:       'htmlmixed',
        css:        'css'
    };

    // Determine initial mode from server-injected snippet language (or default)
    var initialLang = (window.SNIPPET_LANG || 'python').toLowerCase();
    var initialMode = LANG_MODE_MAP[initialLang] || 'python';

    // Create the editor instance (exposed globally for other scripts)
    window.editor = CodeMirror.fromTextArea(editorTextarea, {
        mode:             initialMode,
        theme:            'dracula',
        lineNumbers:      true,
        matchBrackets:    true,
        autoCloseBrackets: true,
        indentUnit:       4,
        tabSize:          4,
        indentWithTabs:   false,
        lineWrapping:     true,
        autofocus:        true
    });

    // If a snippet was loaded from server, set code (Jinja injects SNIPPET_CODE)
    if (window.SNIPPET_CODE && window.SNIPPET_CODE.trim() !== '') {
        editor.setValue(window.SNIPPET_CODE);
    }

    // ----------------------------------------------------------------
    // 2. Live line count updater
    // ----------------------------------------------------------------
    editor.on('change', function () {
        $('#lineCount').text(editor.lineCount());

        // Update tab filename display as user types
        var fname = $('#filenameInput').val().trim();
        $('#tabFilename').text(fname || 'untitled');
    });

    // Set initial line count
    $('#lineCount').text(editor.lineCount());


    // ----------------------------------------------------------------
    // 3. Language dropdown → change CodeMirror mode + update filename extension
    // ----------------------------------------------------------------
    $('#languageSelect').on('change', function () {
        var selectedLang = $(this).val();
        var newMode = LANG_MODE_MAP[selectedLang] || 'python';
        editor.setOption('mode', newMode);

        // Auto-update filename extension
        var currentFilename = $('#filenameInput').val().trim();
        if (currentFilename) {
            var dotIndex = currentFilename.lastIndexOf('.');
            var baseName = dotIndex !== -1 ? currentFilename.substring(0, dotIndex) : currentFilename;
            
            var extMap = {
                python: '.py',
                javascript: '.js',
                html: '.html',
                css: '.css'
            };
            var newExt = extMap[selectedLang] || '.txt';
            var newFilename = baseName + newExt;
            
            $('#filenameInput').val(newFilename);
            $('#tabFilename').text(newFilename);
        }
    });

    // Also update tab filename when user types in filename input
    $('#filenameInput').on('input', function () {
        var fname = $(this).val().trim();
        $('#tabFilename').text(fname || 'untitled');
    });


    // ================================================================
    // 4. RUN BUTTON
    // ================================================================
    $('#runBtn').on('click', function () {
        var code = editor.getValue();
        var language = $('#languageSelect').val();

        // Validate: code must not be empty
        if (!code.trim()) {
            showAlert('Please write some code first.', 'warning');
            return;
        }

        // Show loading spinner on Run button
        setRunLoading(true);
        setStatus('Running…');

        // Send code to /run via AJAX
        $.ajax({
            url:         '/run',
            method:      'POST',
            contentType: 'application/json',
            data:         JSON.stringify({ code: code, language: language }),
            success: function (response) {
                setRunLoading(false);

                var outputEl = $('#output');
                var previewEl = $('#webPreview');
                
                // Reset views
                outputEl.removeClass('output-error output-success d-none').addClass('d-none');
                previewEl.addClass('d-none');
                
                // --- Complexity UI Update ---
                if (response.time_complexity && response.time_complexity !== "N/A") {
                    $('#timeComp').text(response.time_complexity);
                    $('#spaceComp').text(response.space_complexity);
                    $('#timeCompContainer, #spaceCompContainer').show();
                } else {
                    $('#timeCompContainer, #spaceCompContainer').hide();
                }

                if (response.is_web) {
                    // Show HTML/CSS preview
                    previewEl.removeClass('d-none');
                    previewEl.attr('srcdoc', response.web_code || '');
                    setStatus('Preview Ready ✓');
                } else if (response.error) {
                    // Display error (stderr) in red
                    outputEl.removeClass('d-none').addClass('output-error');
                    outputEl.html(escapeHtml(response.error));
                    setStatus('Error');
                } else if (response.output !== undefined) {
                    // Display stdout in green
                    outputEl.removeClass('d-none').addClass('output-success');
                    outputEl.html(escapeHtml(response.output) ||
                        '<span class="text-muted">// (No output)</span>');
                    setStatus('Done ✓');
                }
            },
            error: function () {
                setRunLoading(false);
                $('#output')
                    .removeClass('output-success')
                    .addClass('output-error')
                    .html('Server error. Please try again.');
                setStatus('Error');
            }
        });
    });


    // ================================================================
    // 5. SAVE BUTTON
    // ================================================================
    $('#saveBtn').on('click', function () {
        var filename = $('#filenameInput').val().trim();
        var language = $('#languageSelect').val();
        var code     = editor.getValue();

        // Validate: filename required
        if (!filename) {
            showAlert('Please enter a file name before saving.', 'warning');
            $('#filenameInput').focus();
            return;
        }

        // Validate: code must not be empty
        if (!code.trim()) {
            showAlert('Cannot save empty code. Please write something first.', 'warning');
            return;
        }

        // Populate hidden form fields and submit
        $('#hiddenFilename').val(filename);
        $('#hiddenLanguage').val(language);
        $('#hiddenCode').val(code);
        $('#saveForm').submit();
    });


    // ================================================================
    // 6. CLEAR BUTTON (Acts as "New File")
    // ================================================================
    $('#clearBtn').on('click', function () {
        // Clear the editor content
        editor.setValue('');
        editor.clearHistory();

        // Clear output panel
        $('#output')
            .removeClass('output-error output-success d-none')
            .html('<span class="text-muted">// Run your code to see output here...</span>');
        
        $('#webPreview').addClass('d-none').attr('srcdoc', '');

        // Clear filename input
        $('#filenameInput').val('');
        $('#tabFilename').text('untitled');

        // Reset URL (remove ?id=) to indicate a NEW unsaved file
        const url = new URL(window.location);
        url.searchParams.delete('id');
        window.history.pushState({}, '', url);

        // Hide any validation alert
        $('#validationAlert').addClass('d-none');

        setStatus('New File Ready');
        editor.focus();
    });


    // ================================================================
    // 7. CLEAR OUTPUT BUTTON (trash icon in output header)
    // ================================================================
    $('#clearOutputBtn').on('click', function () {
        $('#output')
            .removeClass('output-error output-success')
            .html('<span class="text-muted">// Run your code to see output here...</span>');
    });


    // ================================================================
    // 8. COPY CODE BUTTON
    // ================================================================
    $('#copyBtn').on('click', function () {
        var code = editor.getValue();

        if (!code.trim()) {
            showAlert('Nothing to copy — editor is empty.', 'info');
            return;
        }

        navigator.clipboard.writeText(code).then(function () {
            // Temporarily change button text to "Copied ✓"
            $('#copyBtnText').text('Copied ✓');
            $('#copyBtn').removeClass('btn-outline-info').addClass('btn-success');

            setTimeout(function () {
                $('#copyBtnText').text('Copy Code');
                $('#copyBtn').removeClass('btn-success').addClass('btn-outline-info');
            }, 2000);

        }).catch(function () {
            showAlert('Failed to copy. Please copy manually (Ctrl+A, Ctrl+C).', 'danger');
        });
    });


    // ================================================================
    // 9. DELETE BUTTONS on saved.html
    //    (jQuery confirm dialog before submitting delete form)
    // ================================================================
    // This works on the saved page where .delete-btn exists
    $(document).on('click', '.delete-btn', function (e) {
        e.preventDefault();

        var filename = $(this).data('filename') || 'this snippet';
        var confirmed = window.confirm(
            'Are you sure you want to delete "' + filename + '"?\n'
            + 'This action cannot be undone.'
        );

        if (confirmed) {
            // Submit the parent delete form
            $(this).closest('.delete-form').submit();
        }
        // If cancelled, do nothing
    });


    // ================================================================
    // 10. SIDEBAR FILE LINKS
    //     Already handled via plain <a href> tags in the template.
    //     This block adds a subtle highlight effect on click.
    // ================================================================
    $(document).on('click', '.sidebar-file-link', function () {
        $('.sidebar-file-link').removeClass('active-file');
        $(this).addClass('active-file');
        // Navigation to /?id=<x> happens via the href naturally
    });


    // ================================================================
    // UTILITY FUNCTIONS
    // ================================================================

    /**
     * Show/hide the loading spinner on the Run button.
     * @param {boolean} isLoading
     */
    function setRunLoading(isLoading) {
        if (isLoading) {
            $('#runBtnIcon').html(
                '<span class="spinner-border spinner-border-sm" role="status" '
                + 'aria-hidden="true"></span>'
            );
            $('#runBtnText').text('Running…');
            $('#runBtn').prop('disabled', true);
        } else {
            $('#runBtnIcon').html('<i class="bi bi-play-fill"></i>');
            $('#runBtnText').text('Run');
            $('#runBtn').prop('disabled', false);
        }
    }

    /**
     * Update the status bar message.
     * @param {string} msg
     */
    function setStatus(msg) {
        $('#statusMsg').text(msg);
    }

    /**
     * Show or update the Bootstrap inline alert.
     * @param {string} message
     * @param {string} type  Bootstrap alert type: warning | danger | info
     */
    function showAlert(message, type) {
        var alertEl = $('#validationAlert');
        // Re-set classes for the new type
        alertEl
            .removeClass('alert-warning alert-danger alert-info d-none')
            .addClass('alert-' + (type || 'warning'));
        $('#validationMsg').text(message);
        alertEl.removeClass('d-none');

        // Auto-hide after 4 seconds
        setTimeout(function () {
            alertEl.addClass('d-none');
        }, 4000);
    }

    /**
     * Escape HTML special chars to safely render in .html()
     * @param {string} str
     * @returns {string}
     */
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

}); // end jQuery ready
