// script.js - Frontend logic for CodeEditor

/* ======================================================================
   CodeMirror Editor Initialization
   (IIFE to keep variables scoped; editor exposed as window.editor)
====================================================================== */
$(function () {

    'use strict';

    // Initialize CodeMirror
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

    // Create the primary editor instance
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

    // Create the secondary editor instance (for split view)
    var editorTextarea2 = document.getElementById('codeEditor2');
    window.editor2 = CodeMirror.fromTextArea(editorTextarea2, {
        mode:             'python',
        theme:            'dracula',
        lineNumbers:      true,
        matchBrackets:    true,
        autoCloseBrackets: true,
        indentUnit:       4,
        tabSize:          4,
        indentWithTabs:   false,
        lineWrapping:     true
    });

    // If a snippet was loaded from server, set code (Jinja injects SNIPPET_CODE)
    if (window.SNIPPET_CODE && window.SNIPPET_CODE.trim() !== '') {
        editor.setValue(window.SNIPPET_CODE);
    }

    // Live line count updater
    editor.on('change', function () {
        $('#lineCount').text(editor.lineCount());
        var fname = $('#filenameInput').val().trim();
        $('#tabFilename').text(fname || 'untitled');
    });

    editor2.on('change', function () {
        // Line count reflects the active editor
        if ($('#secondaryPane').is(':visible')) {
            $('#lineCount').text(editor2.lineCount());
        }
    });

    // Focus tracking for line count
    editor.on('focus', function() { $('#lineCount').text(editor.lineCount()); });
    editor2.on('focus', function() { $('#lineCount').text(editor2.lineCount()); });

    // Set initial line count
    $('#lineCount').text(editor.lineCount());


    // Language dropdown handlers
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
        var fname = $(this).val().trim() || 'untitled';
        $('#tabFilename').text(fname);
        $('#primaryBreadcrumbFile').text(fname);
    });


    // Run Button
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


    // Save Button
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


    // Clear & New File Workflow
    
    // Function to initialize a new file state
    function createNewFile(defaultFilename = 'untitled.py') {
        // Clear the editor content
        editor.setValue('');
        editor.clearHistory();

        // Clear output panel
        $('#output')
            .removeClass('output-error output-success d-none')
            .html('<span class="text-muted">// Run your code to see output here...</span>');
        
        $('#webPreview').addClass('d-none').attr('srcdoc', '');

        // Set filename and trigger extension update
        $('#filenameInput').val(defaultFilename);
        $('#tabFilename').text(defaultFilename);
        $('#primaryBreadcrumbFile').text(defaultFilename);

        // Reset URL (remove ?id=) to indicate a NEW unsaved file
        const url = new URL(window.location);
        url.searchParams.delete('id');
        window.history.pushState({}, '', url);

        // Hide any validation alert
        $('#validationAlert').addClass('d-none');

        // Infer language from extension
        updateLanguageFromExtension(defaultFilename);

        setStatus('New File Ready');
        editor.focus();
    }

    // Helper to infer language from filename extension
    function updateLanguageFromExtension(filename) {
        if (!filename) return;
        var ext = filename.split('.').pop().toLowerCase();
        var extToLang = {
            'py': 'python',
            'js': 'javascript',
            'html': 'html',
            'htm': 'html',
            'css': 'css'
        };
        var lang = extToLang[ext];
        if (lang) {
            $('#languageSelect').val(lang).trigger('change');
        }
    }

    // New File Icon (Sidebar)
    $('#newFileIcon').on('click', function() {
        $('#modalFilenameInput').val('');
        $('#modalFilenameError').addClass('d-none');
        $('#newFileModal').modal('show');
    });

    // Confirm New File (Modal)
    $('#confirmNewFileBtn').on('click', function() {
        var filename = $('#modalFilenameInput').val().trim();
        if (!filename) {
            $('#modalFilenameError').removeClass('d-none');
            return;
        }
        
        $('#newFileModal').modal('hide');
        createNewFile(filename);
    });

    // Handle 'Enter' in modal input
    $('#modalFilenameInput').on('keypress', function(e) {
        if (e.which == 13) {
            $('#confirmNewFileBtn').trigger('click');
        }
    });

    // Toolbar "Clear" acts as a quick reset to "untitled.py"
    $('#clearBtn').on('click', function () {
        createNewFile('untitled.py');
    });


    // Clear Output
    $('#clearOutputBtn').on('click', function () {
        $('#output')
            .removeClass('output-error output-success')
            .html('<span class="text-muted">// Run your code to see output here...</span>');
    });


    // Split Editor
    $('#splitBtn, #closeRightPane').on('click', function () {
        var secondaryPane = $('#secondaryPane');
        var primaryPane = $('#primaryPane');
        
        if (secondaryPane.hasClass('d-none')) {
            // SHOW SPLIT
            secondaryPane.removeClass('d-none');
            $('#splitBtn').addClass('active btn-warning').removeClass('btn-outline-warning');
            $('#splitBtnText').text('Unsplit');
            
            // Sync current primary content to secondary if it's empty
            if (!editor2.getValue().trim()) {
                editor2.setValue(editor.getValue());
                editor2.setOption('mode', editor.getOption('mode'));
                $('#languageSelect2').val($('#languageSelect').val());
                $('#tabFilename2').text($('#tabFilename').text());
            }

            // Refresh both to fix layout issues
            setTimeout(function() {
                editor.refresh();
                editor2.refresh();
            }, 100);
        } else {
            // HIDE SPLIT
            secondaryPane.addClass('d-none');
            $('#splitBtn').removeClass('active btn-warning').addClass('btn-outline-warning');
            $('#splitBtnText').text('Split');
            
            setTimeout(function() {
                editor.refresh();
            }, 100);
        }
    });

    // Open in right pane via sidebar button
    $(document).on('click', '.open-right-pane-btn', function(e) {
        e.preventDefault();
        e.stopPropagation();

        var code = $(this).data('code');
        var lang = $(this).data('lang');
        var filename = $(this).data('filename');

        // Show pane if hidden
        if ($('#secondaryPane').hasClass('d-none')) {
            $('#splitBtn').trigger('click');
        }

        editor2.setValue(code);
        editor2.setOption('mode', LANG_MODE_MAP[lang] || 'python');
        $('#languageSelect2').val(lang);
        $('#secondaryBreadcrumbFile').text(filename); // Update breadcrumb
        
        editor2.refresh();
    });

    // Run button for right pane
    $('#runBtn2').on('click', function() {
        var code = editor2.getValue();
        var language = $('#languageSelect2').val();
        runCodeLogic(code, language, "Output (Pane 2)");
    });

    // Refactored Run Logic
    function runCodeLogic(code, language, label) {
        if (!code.trim()) {
            showAlert('Please write some code first.', 'warning');
            return;
        }

        setRunLoading(true);
        setStatus('Running…');
        $('#outputLabel').text(label || "Output");

        $.ajax({
            url:         '/run',
            method:      'POST',
            contentType: 'application/json',
            data:         JSON.stringify({ code: code, language: language }),
            success: function (response) {
                setRunLoading(false);
                var outputEl = $('#output');
                var previewEl = $('#webPreview');
                
                outputEl.removeClass('output-error output-success d-none').addClass('d-none');
                previewEl.addClass('d-none');
                
                if (response.time_complexity && response.time_complexity !== "N/A") {
                    $('#timeComp').text(response.time_complexity);
                    $('#spaceComp').text(response.space_complexity);
                    $('#timeCompContainer, #spaceCompContainer').show();
                } else {
                    $('#timeCompContainer, #spaceCompContainer').hide();
                }

                if (response.is_web) {
                    previewEl.removeClass('d-none');
                    previewEl.attr('srcdoc', response.web_code || '');
                    setStatus('Preview Ready ✓');
                } else if (response.error) {
                    outputEl.removeClass('d-none').addClass('output-error');
                    outputEl.html(escapeHtml(response.error));
                    setStatus('Error');
                } else if (response.output !== undefined) {
                    outputEl.removeClass('d-none').addClass('output-success');
                    outputEl.html(escapeHtml(response.output) || '<span class="text-muted">// (No output)</span>');
                    setStatus('Done ✓');
                }
            },
            error: function () {
                setRunLoading(false);
                $('#output').removeClass('output-success').addClass('output-error').html('Server error. Please try again.');
                setStatus('Error');
            }
        });
    }

    // Update main run button to use refactored logic
    $('#runBtn').off('click').on('click', function () {
        runCodeLogic(editor.getValue(), $('#languageSelect').val(), "Output (Pane 1)");
    });

    // Copy Code
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


    // Delete Confirmations
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


    // Sidebar Highlighting
    $(document).on('click', '.sidebar-file-link', function () {
        $('.sidebar-file-link').removeClass('active-file');
        $(this).addClass('active-file');
        // Navigation to /?id=<x> happens via the href naturally
    });


    // Explorer Toggles
    $(document).on('click', '.folder-header, .folder-title', function(e) {
        e.preventDefault();
        e.stopPropagation();

        var $parent = $(this).closest('.explorer-folder, .folder-item');
        var $list = $(this).next('ul');
        var $icon = $(this).find('.bi-chevron-down, .bi-chevron-right');

        if ($list.length === 0) {
            // Find the list in the next sibling if not immediate
            $list = $parent.find('> ul');
        }

        $list.slideToggle(150);
        $parent.toggleClass('collapsed');

        // Toggle icons
        if ($icon.hasClass('bi-chevron-down')) {
            $icon.removeClass('bi-chevron-down').addClass('bi-chevron-right');
        } else {
            $icon.removeClass('bi-chevron-right').addClass('bi-chevron-down');
        }
    });

    // New Folder Workflow
    $('#newFolderIcon').on('click', function() {
        $('#modalFolderNameInput').val('');
        $('#modalFolderNameError').addClass('d-none');
        $('#newFolderModal').modal('show');
    });

    $('#confirmNewFolderBtn').on('click', function() {
        var folderName = $('#modalFolderNameInput').val().trim();
        if (!folderName) {
            $('#modalFolderNameError').removeClass('d-none');
            return;
        }

        $('#newFolderModal').modal('hide');
        
        // UI-only feedback (Create a temporary folder item)
        var newFolderHtml = `
            <li class="folder-item">
                <div class="folder-title d-flex align-items-center px-2 py-1">
                    <i class="bi bi-chevron-right me-1" style="font-size: 10px;"></i>
                    <i class="bi bi-folder-fill me-2 text-primary"></i>
                    <span class="small">${folderName} (new)</span>
                </div>
                <ul class="list-unstyled mb-0 ps-3" style="display:none;">
                    <li class="text-muted small px-3 py-1">Empty</li>
                </ul>
            </li>
        `;
        
        $('#projectRoot > ul').append(newFolderHtml);
        setStatus(`Folder "${folderName}" created (UI only)`);
    });

    // Handle 'Enter' in folder modal
    $('#modalFolderNameInput').on('keypress', function(e) {
        if (e.which == 13) {
            $('#confirmNewFolderBtn').trigger('click');
        }
    });

    // Refresh Sidebar (Simple reload)
    $('#refreshSidebarIcon').on('click', function() {
        location.reload();
    });


    // Utilities

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
