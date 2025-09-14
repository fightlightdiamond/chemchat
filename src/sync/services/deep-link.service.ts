import { Injectable, Logger } from '@nestjs/common';
import { DeepLink, DeepLinkType } from '../interfaces/sync.interfaces';

@Injectable()
export class DeepLinkService {
  private readonly logger = new Logger(DeepLinkService.name);
  private readonly BASE_URL = process.env.CLIENT_BASE_URL || 'https://app.chemchat.com';

  constructor() {}

  generateDeepLink(deepLink: DeepLink): string {
    try {
      const url = new URL(this.BASE_URL);
      
      switch (deepLink.type) {
        case DeepLinkType.CONVERSATION:
          if (deepLink.conversationId) {
            url.pathname = `/chat/${deepLink.conversationId}`;
            if (deepLink.messageId) {
              url.searchParams.set('messageId', deepLink.messageId);
            }
          }
          break;

        case DeepLinkType.MESSAGE:
          if (deepLink.conversationId && deepLink.messageId) {
            url.pathname = `/chat/${deepLink.conversationId}`;
            url.searchParams.set('messageId', deepLink.messageId);
            url.searchParams.set('highlight', 'true');
          }
          break;

        case DeepLinkType.USER_PROFILE:
          if (deepLink.userId) {
            url.pathname = `/profile/${deepLink.userId}`;
          }
          break;

        case DeepLinkType.NOTIFICATION:
          url.pathname = '/notifications';
          if (deepLink.parameters?.notificationId) {
            url.searchParams.set('notificationId', deepLink.parameters.notificationId);
          }
          break;

        default:
          url.pathname = '/';
      }

      // Add any additional parameters
      if (deepLink.parameters) {
        Object.entries(deepLink.parameters).forEach(([key, value]) => {
          if (key !== 'notificationId') { // Already handled above
            url.searchParams.set(key, value);
          }
        });
      }

      this.logger.debug(`Generated deep link: ${url.toString()}`);
      return url.toString();

    } catch (error) {
      this.logger.error('Failed to generate deep link:', error);
      return this.BASE_URL;
    }
  }

  parseDeepLink(url: string): DeepLink | null {
    try {
      const parsedUrl = new URL(url);
      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
      const searchParams = Object.fromEntries(parsedUrl.searchParams.entries());

      if (pathSegments.length === 0) {
        return null;
      }

      const [firstSegment, secondSegment] = pathSegments;

      switch (firstSegment) {
        case 'chat':
          if (secondSegment) {
            const deepLink: DeepLink = {
              type: DeepLinkType.CONVERSATION,
              conversationId: secondSegment,
              parameters: searchParams,
            };

            if (searchParams.messageId) {
              deepLink.messageId = searchParams.messageId;
              if (searchParams.highlight === 'true') {
                deepLink.type = DeepLinkType.MESSAGE;
              }
            }

            return deepLink;
          }
          break;

        case 'profile':
          if (secondSegment) {
            return {
              type: DeepLinkType.USER_PROFILE,
              userId: secondSegment,
              parameters: searchParams,
            };
          }
          break;

        case 'notifications':
          return {
            type: DeepLinkType.NOTIFICATION,
            parameters: searchParams,
          };

        default:
          return null;
      }

      return null;

    } catch (error) {
      this.logger.error('Failed to parse deep link:', error);
      return null;
    }
  }

  generateNotificationDeepLink(
    conversationId: string,
    messageId?: string,
    additionalParams?: Record<string, string>,
  ): string {
    const deepLink: DeepLink = {
      type: messageId ? DeepLinkType.MESSAGE : DeepLinkType.CONVERSATION,
      conversationId,
      messageId,
      parameters: {
        source: 'push_notification',
        ...additionalParams,
      },
    };

    return this.generateDeepLink(deepLink);
  }

  generateShareLink(
    conversationId: string,
    messageId?: string,
  ): string {
    const deepLink: DeepLink = {
      type: messageId ? DeepLinkType.MESSAGE : DeepLinkType.CONVERSATION,
      conversationId,
      messageId,
      parameters: {
        source: 'share',
      },
    };

    return this.generateDeepLink(deepLink);
  }

  validateDeepLink(deepLink: DeepLink): boolean {
    switch (deepLink.type) {
      case DeepLinkType.CONVERSATION:
        return !!deepLink.conversationId;

      case DeepLinkType.MESSAGE:
        return !!(deepLink.conversationId && deepLink.messageId);

      case DeepLinkType.USER_PROFILE:
        return !!deepLink.userId;

      case DeepLinkType.NOTIFICATION:
        return true; // No required fields

      default:
        return false;
    }
  }

  createUniversalLink(deepLink: DeepLink): {
    webUrl: string;
    iosUrl: string;
    androidUrl: string;
  } {
    const webUrl = this.generateDeepLink(deepLink);
    
    // iOS Universal Link
    const iosUrl = webUrl.replace('https://', 'chemchat://');
    
    // Android Intent URL
    const androidUrl = `intent://${webUrl.replace('https://', '')}#Intent;scheme=https;package=com.chemchat.app;end`;

    return {
      webUrl,
      iosUrl,
      androidUrl,
    };
  }

  extractNavigationInfo(deepLink: DeepLink): {
    route: string;
    params: Record<string, any>;
  } {
    let route = '/';
    const params: Record<string, any> = { ...deepLink.parameters };

    switch (deepLink.type) {
      case DeepLinkType.CONVERSATION:
        route = '/chat';
        params.conversationId = deepLink.conversationId;
        if (deepLink.messageId) {
          params.messageId = deepLink.messageId;
        }
        break;

      case DeepLinkType.MESSAGE:
        route = '/chat';
        params.conversationId = deepLink.conversationId;
        params.messageId = deepLink.messageId;
        params.highlight = true;
        break;

      case DeepLinkType.USER_PROFILE:
        route = '/profile';
        params.userId = deepLink.userId;
        break;

      case DeepLinkType.NOTIFICATION:
        route = '/notifications';
        break;
    }

    return { route, params };
  }

  generateQRCodeData(deepLink: DeepLink): string {
    // Generate a shortened URL or QR-friendly format
    const fullUrl = this.generateDeepLink(deepLink);
    
    // In a real implementation, you might want to use a URL shortener
    // For now, return the full URL
    return fullUrl;
  }

  createEmailDeepLink(
    conversationId: string,
    messageId?: string,
    recipientEmail?: string,
  ): string {
    const deepLink: DeepLink = {
      type: messageId ? DeepLinkType.MESSAGE : DeepLinkType.CONVERSATION,
      conversationId,
      messageId,
      parameters: {
        source: 'email',
        ...(recipientEmail && { recipient: recipientEmail }),
      },
    };

    return this.generateDeepLink(deepLink);
  }

  createSMSDeepLink(
    conversationId: string,
    messageId?: string,
    recipientPhone?: string,
  ): string {
    const deepLink: DeepLink = {
      type: messageId ? DeepLinkType.MESSAGE : DeepLinkType.CONVERSATION,
      conversationId,
      messageId,
      parameters: {
        source: 'sms',
        ...(recipientPhone && { recipient: recipientPhone }),
      },
    };

    return this.generateDeepLink(deepLink);
  }
}
