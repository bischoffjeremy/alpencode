#!/bin/bash

# ============================================
# 🚀 AlpenCode Release Script
# ============================================
#
# Automatisiert den Release-Prozess:
# 1. Git commit der Änderungen
# 2. Version erhöhen (patch/minor/major)
# 3. Git tag erstellen
# 4. Push zu GitHub
# 5. Publish im VS Code Marketplace
#
# ============================================
# VERWENDUNG:
# ============================================
#
# Basis (patch version bump):
#   ./release.sh -m "Deine Commit-Nachricht"
#
# Minor version bump:
#   ./release.sh -m "Neue Features" -b minor
#
# Major version bump:
#   ./release.sh -m "Breaking Changes" -b major
#
# Force (auch ohne Änderungen):
#   ./release.sh -m "Hotfix" --force
#
# Hilfe anzeigen:
#   ./release.sh --help
#
# ============================================
# VORAUSSETZUNGEN:
# ============================================
#
# 1. vsce installieren:
#    npm install -g @vscode/vsce
#
# 2. Bei VS Code Marketplace anmelden:
#    vsce login bischoff-ventures
#
# 3. Git-Repository sauber (auf main branch)
#
# ============================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
EXTENSION_DIR="vscode-extension"
COMMIT_MESSAGE=""
VERSION_BUMP="patch"  # patch, minor, or major

# Functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
check_directory() {
    if [ ! -f "pyproject.toml" ] || [ ! -d "$EXTENSION_DIR" ]; then
        log_error "Not in AlpenCode root directory!"
        log_error "Make sure you're in the directory with pyproject.toml and vscode-extension/"
        exit 1
    fi
}

# Check git status
check_git_status() {
    log_info "Checking git status..."

    if [ -n "$(git status --porcelain)" ]; then
        log_info "Uncommitted changes found:"
        git status --short
    else
        log_warning "No changes to commit. Use --force to continue anyway."
        if [ "$1" != "--force" ]; then
            exit 0
        fi
    fi
}

# Get commit message
get_commit_message() {
    if [ -z "$COMMIT_MESSAGE" ]; then
        echo "Enter commit message:"
        read -r COMMIT_MESSAGE
    fi

    if [ -z "$COMMIT_MESSAGE" ]; then
        log_error "Commit message cannot be empty!"
        exit 1
    fi
}

# Commit changes
commit_changes() {
    log_info "Committing changes..."

    git add .
    git commit -m "$COMMIT_MESSAGE"

    log_success "Changes committed"
}

# Bump version in package.json
bump_version() {
    log_info "Bumping version ($VERSION_BUMP)..."

    cd "$EXTENSION_DIR"

    # Get current version
    CURRENT_VERSION=$(node -p "require('./package.json').version")
    log_info "Current version: $CURRENT_VERSION"

    # Calculate new version
    IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
    MAJOR=${VERSION_PARTS[0]}
    MINOR=${VERSION_PARTS[1]}
    PATCH=${VERSION_PARTS[2]}

    case $VERSION_BUMP in
        major)
            MAJOR=$((MAJOR + 1))
            MINOR=0
            PATCH=0
            ;;
        minor)
            MINOR=$((MINOR + 1))
            PATCH=0
            ;;
        patch)
            PATCH=$((PATCH + 1))
            ;;
        *)
            log_error "Invalid version bump type: $VERSION_BUMP"
            exit 1
            ;;
    esac

    NEW_VERSION="$MAJOR.$MINOR.$PATCH"
    log_info "New version: $NEW_VERSION"

    # Update package.json
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        pkg.version = '$NEW_VERSION';
        fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "

    log_success "Version bumped to $NEW_VERSION"

    cd ..
}

# Create git tag
create_git_tag() {
    cd "$EXTENSION_DIR"

    VERSION=$(node -p "require('./package.json').version")
    TAG="v$VERSION"

    cd ..

    log_info "Creating git tag: $TAG"
    git tag "$TAG"

    log_success "Tag created: $TAG"
}

# Publish to marketplace
publish_extension() {
    log_info "Publishing to VS Code Marketplace..."

    cd "$EXTENSION_DIR"

    # Check if vsce is installed
    if ! command -v vsce &> /dev/null; then
        log_error "vsce not found! Install with: npm install -g @vscode/vsce"
        exit 1
    fi

    # Check if user is logged in
    if ! vsce show bischoff-ventures.alpencode &> /dev/null; then
        log_warning "Not logged in to VS Code Marketplace"
        log_info "Run: vsce login bischoff-ventures"
        log_info "Then re-run this script"
        exit 1
    fi

    # Publish
    vsce publish

    log_success "Extension published to marketplace!"

    cd ..
}

# Push to git
push_changes() {
    log_info "Pushing changes to git..."

    git push origin main
    git push origin --tags

    log_success "Changes pushed to git"
}

# Main script
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --message|-m)
                COMMIT_MESSAGE="$2"
                shift 2
                ;;
            --bump|-b)
                VERSION_BUMP="$2"
                shift 2
                ;;
            --force|-f)
                FORCE_COMMIT=true
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  -m, --message MESSAGE    Commit message"
                echo "  -b, --bump TYPE          Version bump type (patch, minor, major)"
                echo "  -f, --force              Force commit even with no changes"
                echo "  -h, --help               Show this help"
                echo ""
                echo "Example:"
                echo "  $0 -m 'Add new feature' -b minor"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    log_info "🚀 AlpenCode Release Script"
    log_info "=========================="

    check_directory

    if [ "$FORCE_COMMIT" != "true" ]; then
        check_git_status
    fi

    get_commit_message
    commit_changes
    bump_version
    create_git_tag
    push_changes
    publish_extension

    log_success "🎉 Release complete!"
    log_info "Check: https://marketplace.visualstudio.com/items?itemName=bischoff-ventures.alpencode"
}

# Run main function
main "$@"