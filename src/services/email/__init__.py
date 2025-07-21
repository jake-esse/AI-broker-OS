"""Email Services Module"""
from .oauth import OAuthService
from .intake import EmailIntakeService
from .imap import IMAPEmailClient, IMAPPollingService
from .classifier import EmailIntentClassifier

__all__ = ["OAuthService", "EmailIntakeService", "IMAPEmailClient", "IMAPPollingService", "EmailIntentClassifier"]
